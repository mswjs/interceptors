// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/481
 */
import net from 'node:net'
import http from 'node:http'
import { inject } from 'vitest'
import { invariant } from 'outvariant'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const nodeMajorVersion = inject('nodeMajorVersion')

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

/**
 * A real proxy server that refuses all tunnels.
 * Serves as the compliance reference for the mocked behavior.
 */
const realProxy = http.createServer()
realProxy.on('connect', (request, socket) => {
  socket.end(
    'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  )
})

type ClientEvent = [name: string, ...args: Array<unknown>]

/**
 * Send a "CONNECT" request to the given proxy and record
 * all events the client observes.
 */
function requestTunnel(proxyPort: number): Array<ClientEvent> {
  const events: Array<ClientEvent> = []

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: proxyPort,
      path: 'example.com:443',
    })
    .end()

  request
    .on('connect', (response, socket, head) => {
      events.push(['request:connect', response.statusCode, head.byteLength])
      socket
        .on('data', (chunk) => events.push(['socket:data', chunk.byteLength]))
        .on('end', () => events.push(['socket:end']))
        .on('error', (error) => events.push(['socket:error', error.message]))
        .on('close', (hadError) => events.push(['socket:close', hadError]))
    })
    .on('response', (response) =>
      events.push(['request:response', response.statusCode])
    )
    .on('error', (error) => events.push(['request:error', error.message]))
    .on('close', () => events.push(['request:close']))

  return events
}

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('original')
      })
    },
  })
  await new Promise<void>((resolve) => {
    realProxy.listen(0, '127.0.0.1', resolve)
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
  await new Promise((resolve) => realProxy.close(resolve))
})

it('intercepts a "CONNECT" request using IP as the authority', async () => {
  const requestPromise = Promise.withResolvers<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()

  const serverHost = httpServer.http.url().host

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      /**
       * @note CONNECT requests use "path" to describe the requested authority
       * in a "host:port" format.
       */
      path: serverHost,
    })
    .end()

  request.on('connect', connectListener).on('response', responseListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect(connectListener).toHaveBeenCalledExactlyOnceWith(
    // The mocked response sent from the interceptor.
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    }),
    expect.any(net.Socket),
    expect.any(Buffer)
  )

  // CONNECT requests do NOT produce an actual response.
  expect(responseListener).not.toHaveBeenCalled()

  const interceptedRequest = await requestPromise.promise

  expect.soft(interceptedRequest.method).toBe('CONNECT')
  expect
    .soft(interceptedRequest.url, 'Sets connect authority as the request URL')
    .toBe(serverHost)
  expect.soft(Array.from(interceptedRequest.headers)).toEqual([
    ['connection', 'keep-alive'],
    [
      'host',
      /**
       * @note Node.js v26+ sets the CONNECT authority as the "Host" header
       * instead of the proxy address (RFC 9110).
       */
      nodeMajorVersion >= 26 ? serverHost : '127.0.0.1:1337',
    ],
  ])
})

/**
 * @note This test exists only because Node.js has a bug parsing
 * URLs like "http://127.0.0.1:1337/localhost:80". It would treat "localhost:"
 * as a protocol.
 */
it('intercepts a "CONNECT" request using "localhost" as the authority', async () => {
  const requestPromise = Promise.withResolvers<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()

  const serverHost = `localhost:${httpServer.http.url().port}`

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      path: serverHost,
    })
    .end()

  request.on('connect', connectListener).on('response', responseListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect(connectListener).toHaveBeenCalledExactlyOnceWith(
    // The mocked response sent from the interceptor.
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    }),
    expect.any(net.Socket),
    expect.any(Buffer)
  )

  // CONNECT requests do NOT produce an actual response.
  expect(responseListener).not.toHaveBeenCalled()

  const interceptedRequest = await requestPromise.promise

  expect.soft(interceptedRequest.method).toBe('CONNECT')
  expect
    .soft(interceptedRequest.url, 'Sets connect authority as the request URL')
    .toBe(serverHost)
  expect.soft(Array.from(interceptedRequest.headers)).toEqual([
    ['connection', 'keep-alive'],
    ['host', nodeMajorVersion >= 26 ? serverHost : '127.0.0.1:1337'],
  ])
})

it('errors the intercepted "CONNECT" request', async () => {
  const requestPromise = Promise.withResolvers<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.errorWith(new Error('Custom reason'))
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()

  const serverHost = `localhost:${httpServer.http.url().port}`

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      path: serverHost,
    })
    .end()

  request
    .on('connect', connectListener)
    .on('response', responseListener)
    .on('error', errorListener)
    .on('close', closeListener)

  await expect.poll(() => errorListener).toHaveBeenCalledOnce()
  expect(errorListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: 'Custom reason' })
  )
  expect(closeListener).toHaveBeenCalledOnce()
  expect(connectListener).not.toHaveBeenCalled()
  expect(responseListener).not.toHaveBeenCalled()
})

it('responds to the "CONNECT" request with a mocked response', async () => {
  const allInterceptedRequests: Array<Request> = []

  interceptor.on('request', ({ request, controller }) => {
    allInterceptedRequests.push(request)

    if (request.method === 'CONNECT') {
      return controller.respondWith(new Response())
    }

    controller.respondWith(new Response('mock'))
  })

  const agent = new HttpsProxyAgent('http://non-existing.remote/server')

  const request = http
    .request({
      hostname: '127.0.0.1',
      port: 80,
      path: '/',
      agent,
    })
    .end()

  // The tunneled request must receive the mocked response.
  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')

  // The interceptor must observe both the "CONNECT" request sent to
  // the proxy and the actual request sent over the established tunnel.
  expect.soft(allInterceptedRequests[0].method).toBe('CONNECT')
  expect.soft(allInterceptedRequests[0].url).toBe('127.0.0.1:80')
  expect.soft(allInterceptedRequests[1].method).toBe('GET')
  expect.soft(allInterceptedRequests[1].url).toBe('http://127.0.0.1/')
  expect.soft(allInterceptedRequests).toHaveLength(2)
})

/**
 * @see https://github.com/mswjs/interceptors/issues/810
 */
it('closes the connection for a mocked non-2xx response to "CONNECT" like a real proxy', async () => {
  const address = realProxy.address()
  invariant(address != null && typeof address === 'object')

  // First, record how the client observes a real proxy refusing the tunnel.
  const realEvents = requestTunnel(address.port)
  await expect.poll(() => realEvents.at(-1)?.[0]).toBe('socket:close')

  // Then, refuse the tunnel with a mocked response.
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'CONNECT') {
      controller.respondWith(new Response(null, { status: 403 }))
    }
  })

  const mockedEvents = requestTunnel(1234)
  await expect.poll(() => mockedEvents).toEqual(realEvents)
})

it('forwards the client half-close over a mocked "CONNECT" tunnel to the tunnel target', async () => {
  // A target that replies only once the client half-closes
  // (e.g. whois/finger-style protocols where FIN ends the query).
  const tunnelTargetServer = new net.Server(
    { allowHalfOpen: true },
    (connection) => {
      connection.resume()
      connection.on('end', () => connection.end('REPLY'))
    }
  )
  await new Promise<void>((resolve) => {
    tunnelTargetServer.listen(0, '127.0.0.1', resolve)
  })
  const targetAddress = tunnelTargetServer.address()
  invariant(targetAddress != null && typeof targetAddress === 'object')

  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'CONNECT') {
      controller.respondWith(new Response(null, { status: 200 }))
    }
  })

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      // The proxy itself is mocked and never dialed.
      port: 1234,
      path: `127.0.0.1:${targetAddress.port}`,
    })
    .end()

  const socket = await new Promise<net.Socket>((resolve, reject) => {
    request.on('connect', (_response, socket) => resolve(socket))
    request.on('error', reject)
  })

  // Send the "query" and half-close: the FIN delimits the query.
  socket.write('PING')
  socket.end()

  const reply = await new Promise<string>((resolve, reject) => {
    socket.on('data', (chunk) => resolve(chunk.toString()))
    socket.on('error', reject)
  })

  expect(reply).toBe('REPLY')

  await new Promise((resolve) => tunnelTargetServer.close(resolve))
})

it('relays non-HTTP data over a mocked "CONNECT" tunnel to the tunnel target', async () => {
  // A raw TCP server acting as the tunnel target.
  const tunnelTargetServer = new net.Server((connection) => {
    connection.on('data', () => connection.write('PONG'))
  })
  await new Promise<void>((resolve) => {
    tunnelTargetServer.listen(0, '127.0.0.1', resolve)
  })
  const targetAddress = tunnelTargetServer.address()
  invariant(targetAddress != null && typeof targetAddress === 'object')

  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'CONNECT') {
      controller.respondWith(new Response(null, { status: 200 }))
    }
  })

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      // The proxy itself is mocked and never dialed.
      port: 1234,
      path: `127.0.0.1:${targetAddress.port}`,
    })
    .end()

  const socket = await new Promise<net.Socket>((resolve, reject) => {
    request.on('connect', (_response, socket) => resolve(socket))
    request.on('error', reject)
  })

  // Send non-HTTP data through the tunnel.
  socket.write('PING')

  const response = await new Promise<string>((resolve, reject) => {
    socket.on('data', (chunk) => {
      resolve(chunk.toString())
      socket.destroy()
    })
    socket.on('error', reject)
  })

  expect(response).toBe('PONG')

  await new Promise((resolve) => tunnelTargetServer.close(resolve))
})
