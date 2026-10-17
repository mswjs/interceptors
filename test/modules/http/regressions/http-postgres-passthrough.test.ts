// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/860
 */
import net from 'node:net'
import tls from 'node:tls'
import postgres, { type Options } from 'postgres'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { createRawTestServer } from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

const int16 = (value: number): Buffer => {
  const buffer = Buffer.alloc(2)
  buffer.writeInt16BE(value)
  return buffer
}

const int32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(value)
  return buffer
}

const cstring = (value: string): Buffer => Buffer.from(`${value}\0`)

const backendMessage = (type: string, ...payload: Array<Buffer>): Buffer => {
  const body = Buffer.concat(payload)
  return Buffer.concat([Buffer.from(type), int32(body.length + 4), body])
}

interface ReceivedMessages {
  sslRequests: number
  startupMessages: Array<Buffer>
  queries: Array<string>
}

/**
 * The smallest PostgreSQL server a real driver connects to and queries.
 * It accepts the startup message (upgrading the connection to TLS first
 * if requested and supported), answers "select N as x" with one row,
 * and, like a real server, rejects a re-sent startup message.
 * @see https://www.postgresql.org/docs/current/protocol-message-formats.html
 */
function createPostgresServer(
  received: ReceivedMessages,
  options: { tls: boolean } = { tls: false }
): net.Server {
  const authenticationOk = backendMessage('R', int32(0))
  const readyForQuery = backendMessage('Z', Buffer.from('I'))
  // One "int4" column named "x" in the text format.
  const rowDescription = backendMessage(
    'T',
    int16(1),
    cstring('x'),
    int32(0),
    int16(0),
    int32(23),
    int16(4),
    int32(-1),
    int16(0)
  )
  const errorResponse = backendMessage(
    'E',
    Buffer.from('S'),
    cstring('FATAL'),
    Buffer.from('C'),
    cstring('08P01'),
    Buffer.from('M'),
    cstring('client re-sent startup pkt'),
    Buffer.from([0])
  )

  const serve = (socket: net.Socket) => {
    let pending = Buffer.alloc(0)
    let startedUp = false

    const onData = (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])

      while (true) {
        // The startup message has no type byte, only its length.
        if (!startedUp) {
          if (pending.length < 4) {
            return
          }

          const length = pending.readInt32BE(0)

          if (pending.length < length) {
            return
          }

          const message = pending.subarray(0, length)
          pending = pending.subarray(length)

          if (message.readInt32BE(4) === 80877103) {
            received.sslRequests += 1

            if (!options.tls) {
              socket.write('N')
              continue
            }

            // Upgrade the connection to TLS, like a real server does.
            socket.write('S')
            socket.removeListener('data', onData)
            serve(
              new tls.TLSSocket(socket, {
                isServer: true,
                cert: TLS_CERTIFICATE,
                key: TLS_PRIVATE_KEY,
              })
            )
            return
          }

          received.startupMessages.push(message)
          startedUp = true
          socket.write(Buffer.concat([authenticationOk, readyForQuery]))
          continue
        }

        if (pending.length < 5) {
          return
        }

        const type = String.fromCharCode(pending[0])
        const length = pending.readInt32BE(1)

        if (pending.length < length + 1) {
          return
        }

        const payload = pending.subarray(5, length + 1)
        pending = pending.subarray(length + 1)

        switch (type) {
          case 'Q': {
            const query = payload.toString('utf8', 0, payload.length - 1)
            received.queries.push(query)

            const value = /select (\d+)/.exec(query)?.[1] ?? '0'
            socket.write(
              Buffer.concat([
                rowDescription,
                backendMessage(
                  'D',
                  int16(1),
                  int32(value.length),
                  Buffer.from(value)
                ),
                backendMessage('C', cstring('SELECT 1')),
                readyForQuery,
              ])
            )
            continue
          }

          case 'X': {
            socket.end()
            return
          }

          default: {
            // Anything else at this point is a re-sent startup message.
            socket.end(errorResponse)
            return
          }
        }
      }
    }

    socket.on('data', onData)
  }

  return new net.Server(serve)
}

/**
 * Connect the driver to the given server.
 * @note Disposed before the server it connects to (declared after it):
 * the driver terminates its connection while the server is still up.
 */
function connect(
  options: Pick<Options<Record<string, never>>, 'ssl'> & {
    host: string
    port: number
  }
) {
  const sql = postgres({
    ...options,
    user: 'tester',
    database: 'test',
    max: 1,
    fetch_types: false,
  })

  return {
    sql,
    async [Symbol.asyncDispose]() {
      await sql.end({ timeout: 1 })
    },
  }
}

it('passes through a PostgreSQL connection, sending its handshake once', async () => {
  const received: ReceivedMessages = {
    sslRequests: 0,
    startupMessages: [],
    queries: [],
  }
  await using server = await createRawTestServer(() => {
    return createPostgresServer(received)
  })

  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  /**
   * @note The driver sends its startup message from a persistent
   * "connect" listener. The interceptor notifies it of the connection
   * ahead of the verdict, inspects that message, and passes the
   * connection through as non-HTTP.
   */
  await using client = connect({
    host: server.hostname,
    port: server.port,
    ssl: false,
  })
  const { sql } = client

  const firstRows = await sql.unsafe('select 1 as x')
  expect.soft(firstRows[0]).toEqual({ x: 1 })

  // Writes after the real connection reach the server as well.
  const secondRows = await sql.unsafe('select 2 as x')
  expect.soft(secondRows[0]).toEqual({ x: 2 })

  expect.soft(received.startupMessages).toHaveLength(1)
  expect.soft(received.queries).toEqual(['select 1 as x', 'select 2 as x'])
  expect(requestListener).not.toHaveBeenCalled()
})

it('passes through a PostgreSQL connection upgraded to TLS, sending its handshake once', async () => {
  const received: ReceivedMessages = {
    sslRequests: 0,
    startupMessages: [],
    queries: [],
  }
  await using server = await createRawTestServer(() => {
    return createPostgresServer(received, { tls: true })
  })

  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  /**
   * @note With "ssl", the driver sends an "SSLRequest" from a persistent
   * "connect" listener, then layers TLS over the same socket once the
   * server agrees, and sends its startup message from a persistent
   * "secureConnect" listener.
   */
  await using client = connect({
    host: server.hostname,
    port: server.port,
    ssl: { ca: [TLS_CERTIFICATE] },
  })
  const { sql } = client

  const firstRows = await sql.unsafe('select 1 as x')
  expect.soft(firstRows[0]).toEqual({ x: 1 })

  // Writes after the real connection reach the server as well.
  const secondRows = await sql.unsafe('select 2 as x')
  expect.soft(secondRows[0]).toEqual({ x: 2 })

  expect.soft(received.sslRequests).toBe(1)
  expect.soft(received.startupMessages).toHaveLength(1)
  expect.soft(received.queries).toEqual(['select 1 as x', 'select 2 as x'])
  expect(requestListener).not.toHaveBeenCalled()
})
