import http from 'node:http'
import { invariant } from 'outvariant'
import { setTimeout } from 'node:timers/promises'
import { TestProject } from 'vitest/node'
import { WebSocketServer } from 'ws'
import { Server as SocketIoServer } from 'socket.io'
import {
  createTestHttpServer,
  kServers,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import type { Context } from 'hono'
import type { HttpBindings } from '@hono/node-server'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { compressResponse } from './test/helpers'
// Import the "ProvidedContext" augmentation so "project.provide()" is typed.
import type {} from './test/setup/vitest'

type SupportedContentCoding = 'gzip' | 'x-gzip' | 'deflate' | 'br'

function isSupportedContentCoding(
  coding: string
): coding is SupportedContentCoding {
  return ['gzip', 'x-gzip', 'deflate', 'br'].includes(coding)
}

/**
 * @note Request headers that must not be reflected onto the response
 * by the catch-all route. Reflecting them would corrupt the response
 * framing (e.g. the request's "content-length" does not describe the
 * response body).
 */
const NON_REFLECTABLE_HEADERS = [
  'transfer-encoding',
  'connection',
  'keep-alive',
]

let server: TestHttpServer

/**
 * Reflect the request onto the response: echo the request headers
 * (and the body for non-GET requests), like the previous Express
 * catch-all route did.
 */
function reflectRequest(ctx: Context): Response {
  const headers = new Headers()

  for (const [name, value] of Object.entries(ctx.req.header())) {
    if (value != null && !NON_REFLECTABLE_HEADERS.includes(name)) {
      headers.set(name, value)
    }
  }

  if (ctx.req.header('set-cookie')) {
    const expires = new Date(Date.now() + 90000)
    headers.append(
      'set-cookie',
      `cookie=supersecret; Path=/; Expires=${expires.toUTCString()}; Secure`
    )
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/plain; charset=utf-8')
  }

  if (ctx.req.method === 'GET' || ctx.req.method === 'HEAD') {
    /**
     * @note The request's "content-length" describes the request body,
     * not the fixed response body — let the server compute it instead.
     * The echo branch below keeps it: the body is echoed verbatim.
     */
    headers.delete('content-length')
    return new Response('original-response', { headers })
  }

  // Echo the request body for non-GET requests.
  return new Response(ctx.req.raw.body, { headers })
}

function createSharedTestServer(): Promise<TestHttpServer> {
  return createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      /**
       * @note Allow cross-origin requests since the browser-driven
       * tests query this server from the test runner's origin.
       */
      router.use('*', async (ctx, next) => {
        await next()
        ctx.res.headers.set('access-control-allow-origin', '*')
        ctx.res.headers.set('access-control-allow-headers', '*')
        ctx.res.headers.set('access-control-allow-methods', '*')
        ctx.res.headers.set('access-control-expose-headers', '*')
      })

      router.post('/status', async (ctx) => {
        const status = Number(await ctx.req.text())

        /**
         * @note Respond via the raw Node.js response: the Fetch API
         * `Response` forbids statuses outside of the 200-599 range.
         */
        const { outgoing } = ctx.env as HttpBindings
        /**
         * @note Include the CORS headers directly: raw responses bypass
         * the CORS middleware above (its headers are set on a response
         * that never reaches the wire).
         */
        outgoing.writeHead(status, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
          'access-control-expose-headers': '*',
        })
        outgoing.end()
        return RESPONSE_ALREADY_SENT
      })

      router.get('/redirect', (ctx) => {
        return new Response(null, {
          status: 301,
          headers: {
            location: new URL('/redirect/destination', ctx.req.url).href,
          },
        })
      })
      router.get('/redirect/destination', () => {
        /**
         * @note Reflect the Express behavior the tests assert:
         * "res.send(string)" implied an HTML content type.
         */
        return new Response('destination-body', {
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        })
      })

      router.get('/stream', () => {
        const encoder = new TextEncoder()
        const pad = (value: string) => value + ' '.repeat(1024 - value.length)
        const chunks = [pad('hello'), pad(' '), pad('world')]

        const stream = new ReadableStream({
          async pull(controller) {
            const chunk = chunks.shift()

            if (chunk) {
              await setTimeout(100)
              controller.enqueue(encoder.encode(chunk))
              return
            }

            /**
             * @note Delay closing the stream the same way the chunks
             * are delayed. Closing the stream right after the last chunk
             * makes the last data packet and the end of the response
             * coalesce into a single read on slower machines (e.g. CI).
             * The client then observes fewer chunks than sent.
             */
            await setTimeout(100)
            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            'content-type': 'text/plain',
            'content-length': String(1024 * chunks.length),
          },
        })
      })

      router.get('/compressed', (ctx) => {
        /**
         * @note Use a custom header to communicate the expected encoding
         * because "accept-encoding" is a forbidden browser header.
         */
        const contentEncoding = ctx.req.header('x-accept-encoding') || ''
        const codings = contentEncoding
          .split(',')
          .map((coding) => coding.trim())
          .filter(isSupportedContentCoding)

        return new Response(compressResponse(codings, 'hello world'), {
          headers: {
            'content-encoding': contentEncoding,
          },
        })
      })

      router.get('/switching-protocols', (ctx) => {
        /**
         * @note Respond via the raw Node.js response: the Fetch API
         * `Response` cannot describe a 101 informational response.
         */
        const { outgoing } = ctx.env as HttpBindings
        outgoing.writeHead(101, 'Switching Protocols', {
          connection: 'upgrade',
          upgrade: 'HTTP/2.0',
          'access-control-allow-origin': '*',
        })
        outgoing.end()
        return RESPONSE_ALREADY_SENT
      })

      router.get('/cacheable', (ctx) => {
        if (ctx.req.header('if-none-match') === '"etag-value"') {
          return new Response(null, { status: 304 })
        }

        return new Response('original-response', {
          headers: {
            etag: '"etag-value"',
            'cache-control': 'max-age=0, must-revalidate',
          },
        })
      })

      router.get('/server-error', () => {
        return new Response('Internal Server Error', { status: 500 })
      })
      router.get('/network-error', (ctx) => {
        const { outgoing } = ctx.env as HttpBindings
        outgoing.destroy()
        return RESPONSE_ALREADY_SENT
      })

      router.get('/delay', async () => {
        await setTimeout(150)
        return new Response('original-response')
      })

      router.all('*', (ctx) => {
        return reflectRequest(ctx)
      })
    },
  })
}

/**
 * A WebSocket server whose behavior is controlled via
 * the connection URL search parameters:
 * - `?greet`, sends a "hello world" message to the client;
 * - `?echo`, sends any received message back to the client;
 * - `?close={code(,reason)}`, closes the client connection.
 */
const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

wsServer.on('connection', (client, request) => {
  const url = new URL(request.url || '/', 'ws://localhost')

  if (url.searchParams.has('greet')) {
    client.send('hello world')
  }

  if (url.searchParams.has('greet-binary')) {
    client.send(new TextEncoder().encode('hello'))
  }

  if (url.searchParams.has('echo')) {
    client.on('message', (data, isBinary) => {
      client.send(data, { binary: isBinary })
    })
  }

  if (url.searchParams.has('close')) {
    const [code, reason] = (url.searchParams.get('close') || '').split(',')
    client.close(Number(code) || undefined, reason)
  }
})

/**
 * A Socket.IO server that echoes any received message back to the client.
 */
const socketIoHttpServer = new http.Server()
const socketIoServer = new SocketIoServer(socketIoHttpServer, {
  transports: ['websocket'],
})

socketIoServer.on('connection', (socket) => {
  socket.on('message', (data) => {
    socket.send(data)
  })
})

function getSocketIoServerUrl(): string {
  const address = socketIoHttpServer.address()

  if (address == null || typeof address === 'string') {
    throw new Error('Failed to retrieve the Socket.IO server address')
  }

  return `http://localhost:${address.port}/`
}

/**
 * Serve the reflection behavior for the root path ("/") via the raw
 * Node.js request listener. The test server package registers its own
 * "GET /" route before any user-defined routes, and route registration
 * order wins in Hono, so the root path cannot be overridden at the
 * router level.
 */
function serveRootPathReflection(server: TestHttpServer): void {
  const servers: Map<string, http.Server> = Reflect.get(server, kServers)

  for (const nodeServer of servers.values()) {
    const requestListeners = nodeServer.listeners(
      'request'
    ) as Array<http.RequestListener>

    nodeServer.removeAllListeners('request')
    nodeServer.on('request', (request, response) => {
      if (request.url !== '/' && !request.url?.startsWith('/?')) {
        for (const listener of requestListeners) {
          listener(request, response)
        }
        return
      }

      const headers: http.OutgoingHttpHeaders = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': '*',
      }

      // Reflect the request headers onto the response.
      for (const [name, value] of Object.entries(request.headers)) {
        if (value != null && !NON_REFLECTABLE_HEADERS.includes(name)) {
          headers[name] = value
        }
      }

      if (request.headers['set-cookie']) {
        const expires = new Date(Date.now() + 90000)
        headers['set-cookie'] = [
          ...request.headers['set-cookie'],
          `cookie=supersecret; Path=/; Expires=${expires.toUTCString()}; Secure`,
        ]
      }

      if (headers['content-type'] == null) {
        headers['content-type'] = 'text/plain; charset=utf-8'
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        /**
         * @note The request's "content-length" describes the request
         * body, not the fixed response body. The echo branch below
         * keeps the reflected value: the body is echoed verbatim.
         */
        headers['content-length'] = String(
          Buffer.byteLength('original-response')
        )
        response.writeHead(200, headers)
        response.end('original-response')
        return
      }

      response.writeHead(200, headers)

      // Echo the request body for non-GET requests.
      request.pipe(response)
    })
  }
}

export async function setup(project: TestProject) {
  server = await createSharedTestServer()
  serveRootPathReflection(server)

  await new Promise<void>((resolve) => {
    socketIoHttpServer.listen(0, resolve)
  })

  const wsAddress = wsServer.address()

  invariant(
    wsAddress != null,
    'Failed to set up tests: WebSocket server address is null'
  )

  /**
   * @note Expose the Node.js version only to the Node.js-driven
   * projects. Browser tests must not observe any Node.js version
   * (see "nodeMajorVersion" in "test/setup/vitest.ts").
   */
  project.provide(
    'nodeMajorVersion',
    typeof process !== 'undefined'
      ? Number(process.versions.node.split('.')[0])
      : 0
  )

  project.provide('server', {
    http: server.http.url().href,
    https: server.https.url().href,
    ws:
      typeof wsAddress === 'string'
        ? wsAddress
        : `ws://${wsAddress.address}:${wsAddress.port}/`,
    io: getSocketIoServerUrl(),
  })
}

export async function teardown() {
  await server.close()

  socketIoServer.disconnectSockets()
  await socketIoServer.close()

  await new Promise<void>((resolve, reject) => {
    wsServer.clients.forEach((client) => client.close())
    wsServer.close((error) => {
      if (error) {
        return reject(error)
      }

      resolve()
    })
  })
}
