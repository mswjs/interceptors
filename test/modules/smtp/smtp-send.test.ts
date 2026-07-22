// @vitest-environment node
import net from 'node:net'
import nodemailer from 'nodemailer'
import { SmtpInterceptor } from '#/src/interceptors/smtp'
import { createRawTestServer } from '#/test/helpers'

const interceptor = new SmtpInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

interface SmtpServerLog {
  commands: Array<string>
  messages: Array<string>
  connections: number
}

/**
 * A minimal real SMTP server that supports "AUTH PLAIN", records the
 * received commands and delivered messages, and assigns the queue id
 * "REAL-123" to each delivery.
 */
function createSmtpServer(observed: SmtpServerLog): net.Server {
  return net.createServer((socket) => {
    observed.connections += 1

    let buffer = Buffer.alloc(0)
    let isReadingData = false

    socket.write('220 real.smtp ESMTP\r\n')

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      while (true) {
        if (isReadingData) {
          const terminatorIndex = buffer.indexOf('\r\n.\r\n')

          if (terminatorIndex === -1) {
            return
          }

          observed.messages.push(
            buffer.subarray(0, terminatorIndex).toString('utf8')
          )
          buffer = buffer.subarray(terminatorIndex + 5)
          isReadingData = false
          socket.write('250 2.0.0 Ok: queued as REAL-123\r\n')
          continue
        }

        const lineEndIndex = buffer.indexOf('\r\n')

        if (lineEndIndex === -1) {
          return
        }

        const line = buffer.subarray(0, lineEndIndex).toString('utf8')
        buffer = buffer.subarray(lineEndIndex + 2)
        const command = line.toUpperCase()
        observed.commands.push(line)

        if (command.startsWith('EHLO')) {
          socket.write('250-real.smtp\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (command.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication successful\r\n')
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 Ok\r\n')
        } else if (command.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 Ok\r\n')
        } else if (command.startsWith('DATA')) {
          isReadingData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (command.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n')
          socket.end()
        } else {
          socket.write('250 2.0.0 Ok\r\n')
        }
      }
    })
  })
}

it('performs a real delivery from a mocked session via "server.send()"', async () => {
  const observed: SmtpServerLog = { commands: [], messages: [], connections: 0 }
  await using server = await createRawTestServer(() => createSmtpServer(observed))

  interceptor.on('session', ({ client, server: realServer }) => {
    // The session stays mocked: the mock greets, authenticates, and
    // accepts the envelope. Only the finished message is delivered
    // for real, and the handler authors what the client sees.
    client.on('message', async (event) => {
      const reply = await realServer.send(event)
      event.accept({ queueId: `patched-${reply.queueId}` })
    })
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    auth: { user: 'app@example.com', pass: 'secret' },
  })

  const info = await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Delivered for real!',
  })

  // The client observes the patched verdict, not the real one.
  expect.soft(info.accepted).toEqual(['user@example.com'])
  expect.soft(info.response).toBe('250 2.0.0 Ok: queued as patched-REAL-123')

  // The real server received the replayed preamble and the message.
  expect.soft(observed.messages).toHaveLength(1)
  expect.soft(observed.messages[0]).toContain('Delivered for real!')
  expect
    .soft(observed.commands.some((command) => command.startsWith('AUTH PLAIN')))
    .toBe(true)
  expect
    .soft(observed.commands)
    .toContain('MAIL FROM:<app@example.com>')
  expect(observed.commands).toContain('RCPT TO:<user@example.com>')

  transport.close()
})

it('reuses the real connection across the transactions of a session', async () => {
  const observed: SmtpServerLog = { commands: [], messages: [], connections: 0 }
  await using server = await createRawTestServer(() => createSmtpServer(observed))

  interceptor.on('session', ({ client, server: realServer }) => {
    client.on('message', async (event) => {
      const reply = await realServer.send(event)
      event.accept({ queueId: reply.queueId })
    })
  })

  // A pooled transport with a single connection sends both messages
  // over the same SMTP session.
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    pool: true,
    maxConnections: 1,
  })

  await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'First',
  })
  await transport.sendMail({
    from: 'app@example.com',
    to: 'user@example.com',
    text: 'Second',
  })

  transport.close()

  // Both messages were delivered over one real connection,
  // separated by a transaction reset.
  expect.soft(observed.messages).toHaveLength(2)
  expect.soft(observed.connections).toBe(1)
  expect(
    observed.commands.filter((command) => command === 'RSET')
  ).toHaveLength(1)
})

it('rejects "server.send()" when the real server is unreachable', async () => {
  // Reserve a port with no server behind it.
  const deadServer = await createRawTestServer(() => net.createServer())
  const deadPort = deadServer.port
  await deadServer[Symbol.asyncDispose]()

  interceptor.on('session', ({ client, server }) => {
    client.on('message', async (event) => {
      try {
        await server.send(event)
        event.accept()
      } catch {
        // The delivery failure never reaches the client on its own:
        // the handler decides what the client observes.
        event.defer({ reason: 'Upstream unavailable' })
      }
    })
  })

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: deadPort,
    secure: false,
  })

  await expect(
    transport.sendMail({
      from: 'app@example.com',
      to: 'user@example.com',
      text: 'Hello',
    })
  ).rejects.toMatchObject({
    code: 'EMESSAGE',
    responseCode: 451,
    response: '451 4.3.0 Upstream unavailable',
  })

  transport.close()
})
