import { invariant } from 'outvariant'
import net from 'node:net'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import http from 'node:http'
import { RequestHandler } from 'express'
import type { MockedFunction } from 'vitest'
import { FetchResponse } from '#/src/utils/fetchUtils'

export const REQUEST_ID_REGEXP = /^\w{9,}$/

export async function readBlob(
  blob: Blob
): Promise<string | ArrayBuffer | null> {
  const pendingResult = Promise.withResolvers<string | ArrayBuffer | null>()

  const reader = new FileReader()
  reader.addEventListener('loadend', () => {
    pendingResult.resolve(reader.result)
  })
  reader.addEventListener('abort', () => pendingResult.reject())
  reader.addEventListener('error', () => pendingResult.reject())
  reader.readAsText(blob)

  return pendingResult.promise
}

export async function toWebResponse(
  request: http.ClientRequest
): Promise<[Response, http.IncomingMessage]> {
  const pendingResponse =
    Promise.withResolvers<[Response, http.IncomingMessage]>()

  request
    .on('response', (response) => {
      const responseBody = response.destroyed
        ? null
        : (Readable.toWeb(response) as ReadableStream)

      const fetchResponse = new FetchResponse(responseBody, {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: FetchResponse.parseRawHeaders(response.rawHeaders),
      })

      pendingResponse.resolve([fetchResponse, response])
    })
    .on('error', (error) => pendingResponse.reject(error))
    .on('abort', () => pendingResponse.reject(new Error('Request aborted')))

  return pendingResponse.promise
}

export const useCors: RequestHandler = (_req, res, next) => {
  res.set({
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  })
  return next()
}

/**
 * Compress the given data using the specified `Content-Encoding` codings
 * left-to-right.
 */
export function compressResponse(
  codings: Array<'gzip' | 'x-gzip' | 'deflate' | 'br'>,
  input: string
) {
  let output = Buffer.from(input)

  for (const coding of codings) {
    if (coding === 'gzip' || coding === 'x-gzip') {
      output = zlib.gzipSync(output)
    } else if (coding === 'deflate') {
      output = zlib.deflateSync(output)
    } else if (coding === 'br') {
      output = zlib.brotliCompressSync(output)
    }
  }

  return output
}

export async function createTestServer<T extends net.Server>(
  createServer: () => T
): Promise<
  AsyncDisposable & {
    instance: T
    port: number
    hostname: string
    http: {
      url: (path: string) => URL
    }
    https: {
      url: (path: string) => URL
    }
  }
> {
  const server = createServer()

  /**
   * Track open connections so disposal can destroy the survivors.
   * `net.Server.close()` only calls back once every connection has
   * closed, and tests legitimately leave half-open or unread sockets
   * behind (the `net.Server` equivalent of `closeAllConnections()`).
   */
  const openConnections = new Set<net.Socket>()

  server.on('connection', (socket) => {
    openConnections.add(socket)
    socket.once('close', () => {
      openConnections.delete(socket)
    })
  })

  const pendingListen = Promise.withResolvers<void>()

  server
    .listen(0, '127.0.0.1', () => pendingListen.resolve())
    .once('error', (error) => pendingListen.reject(error))

  await pendingListen.promise

  const rawAddress = server.address()

  invariant(
    rawAddress != null,
    'Failed to open a test server: server address is null'
  )
  invariant(
    typeof rawAddress === 'object' && 'port' in rawAddress,
    'Failed to open a test server: server address is not AddressInfo'
  )

  const createUrlHelper = (protocol: 'https' | 'http') => {
    return (path: string): URL => {
      return new URL(
        path,
        new URL(`${protocol}://${rawAddress.address}:${rawAddress.port}`)
      )
    }
  }

  return {
    async [Symbol.asyncDispose]() {
      const pendingClose = Promise.withResolvers<void>()

      server.close((error) => {
        if (error) {
          pendingClose.reject(error)
        } else {
          pendingClose.resolve()
        }
      })

      for (const socket of openConnections) {
        socket.destroy()
      }

      await pendingClose.promise
    },
    instance: server,
    port: rawAddress.port,
    hostname: rawAddress.address,
    http: {
      url: createUrlHelper('http'),
    },
    https: {
      url: createUrlHelper('https'),
    },
  }
}

export function spyOnSocket(socket: net.Socket) {
  const eventNames = [
    'lookup',
    'connectionAttempt',
    'connectionAttemptFailed',
    'connectionAttemptTimeout',
    'connect',
    'ready',
    'data',
    'drain',
    'end',
    'error',
    'timeout',
    'close',
  ] as const

  const events: Array<any> = []
  const listeners = {} as Record<
    (typeof eventNames)[number],
    MockedFunction<any>
  >

  for (const eventName of eventNames) {
    listeners[eventName] = vi.fn((...args) => events.push([eventName, ...args]))
    socket.on(eventName, listeners[eventName])
  }

  return {
    events,
    listeners,
  }
}
