// @vitest-environment node
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { runAsInternalConnection } from '#/src/utils/internal-connection'
import { createRawTestServer, toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer
let proxyServer: Awaited<ReturnType<typeof createRawTestServer>>

const targetRequestListener = vi.fn<(url: string) => void>()

/**
 * A real forwarding proxy: it dials the requested authority,
 * confirms the tunnel, and relays the bytes in both directions.
 * @note The proxy dials its targets as an internal connection so
 * its own outgoing sockets escape interception, the same way an
 * out-of-process proxy would.
 */
function createForwardingProxy(): http.Server {
  const proxy = http.createServer()

  proxy.on('connect', (request, clientSocket, head) => {
    const [targetHost, targetPort] = (request.url || '').split(':')
    const targetSocket = runAsInternalConnection(() => {
      return net.connect(Number(targetPort), targetHost)
    })

    targetSocket.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      targetSocket.write(head)
      targetSocket.pipe(clientSocket)
      clientSocket.pipe(targetSocket)
    })
    targetSocket.once('error', () => clientSocket.destroy())
    clientSocket.once('error', () => targetSocket.destroy())
  })

  return proxy
}

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/resource', (ctx) => {
        targetRequestListener(ctx.req.url)
        return new Response('original')
      })
    },
  })
  proxyServer = await createRawTestServer(createForwardingProxy)
})

afterEach(() => {
  interceptor.removeAllListeners()
  targetRequestListener.mockClear()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
  await proxyServer[Symbol.asyncDispose]()
})

function getProxyUrl(): string {
  return proxyServer.http.url('/').href
}

it('passes an HTTP request over a real "CONNECT" tunnel through to the tunnel target', async () => {
  const requestListener = vi.fn<(method: string, url: string) => void>()
  interceptor.on('request', ({ request }) => {
    requestListener(request.method, request.url)
  })

  const url = httpServer.http.url('/resource')
  const request = http
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: new HttpsProxyAgent(getProxyUrl()),
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original')

  expect(targetRequestListener).toHaveBeenCalledOnce()
  expect.soft(requestListener).toHaveBeenNthCalledWith(1, 'CONNECT', url.host)
  expect
    .soft(requestListener)
    .toHaveBeenNthCalledWith(2, 'GET', `http://${url.host}/resource`)
  expect.soft(requestListener).toHaveBeenCalledTimes(2)
})

it('emits the "response" event for an HTTP request passed through a real "CONNECT" tunnel', async () => {
  const responseListener = vi.fn<(url: string, status: number) => void>()
  interceptor.on('response', ({ request, response }) => {
    responseListener(request.url, response.status)
  })

  const url = httpServer.http.url('/resource')
  const request = http
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: new HttpsProxyAgent(getProxyUrl()),
    })
    .end()

  const [response] = await toWebResponse(request)
  await expect(response.text()).resolves.toBe('original')

  expect.soft(responseListener).toHaveBeenNthCalledWith(1, url.host, 200)
  expect
    .soft(responseListener)
    .toHaveBeenNthCalledWith(2, `http://${url.host}/resource`, 200)
  expect.soft(responseListener).toHaveBeenCalledTimes(2)
})

it('mocks an HTTP request over a real "CONNECT" tunnel', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'GET') {
      controller.respondWith(new Response('mock'))
    }
  })

  const url = httpServer.http.url('/resource')
  const request = http
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: new HttpsProxyAgent(getProxyUrl()),
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')

  expect(targetRequestListener).not.toHaveBeenCalled()
})

it('passes an HTTPS request over a real "CONNECT" tunnel through to the tunnel target', async () => {
  const requestListener = vi.fn<(method: string, url: string) => void>()
  interceptor.on('request', ({ request }) => {
    requestListener(request.method, request.url)
  })

  const url = httpServer.https.url('/resource')
  const request = https
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: new HttpsProxyAgent(getProxyUrl()),
      rejectUnauthorized: false,
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original')

  expect(targetRequestListener).toHaveBeenCalledOnce()
  expect.soft(requestListener).toHaveBeenNthCalledWith(1, 'CONNECT', url.host)
  expect
    .soft(requestListener)
    .toHaveBeenNthCalledWith(2, 'GET', `https://${url.host}/resource`)
  expect.soft(requestListener).toHaveBeenCalledTimes(2)
})

it('mocks an HTTPS request over a real "CONNECT" tunnel', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'GET') {
      controller.respondWith(new Response('mock'))
    }
  })

  const url = httpServer.https.url('/resource')
  const request = https
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: new HttpsProxyAgent(getProxyUrl()),
      rejectUnauthorized: false,
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')

  expect(targetRequestListener).not.toHaveBeenCalled()
})

it('mocks an HTTPS request over a mocked "CONNECT" tunnel', async () => {
  const requestListener = vi.fn<(method: string, url: string) => void>()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.method, request.url)

    if (request.method === 'CONNECT') {
      return controller.respondWith(new Response())
    }

    controller.respondWith(new Response('mock'))
  })

  const request = https
    .request('https://example.com/resource', {
      // The proxy itself is mocked and never dialed.
      agent: new HttpsProxyAgent('http://non-existing.proxy/'),
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mock')

  expect
    .soft(requestListener)
    .toHaveBeenNthCalledWith(1, 'CONNECT', 'example.com:443')
  expect
    .soft(requestListener)
    .toHaveBeenNthCalledWith(2, 'GET', 'https://example.com/resource')
  expect.soft(requestListener).toHaveBeenCalledTimes(2)
})

it('passes an HTTPS request over a mocked "CONNECT" tunnel through to the tunnel target', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'CONNECT') {
      controller.respondWith(new Response())
    }
  })

  const url = httpServer.https.url('/resource')
  const request = https
    .request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      // The proxy itself is mocked and never dialed.
      agent: new HttpsProxyAgent('http://non-existing.proxy/'),
      rejectUnauthorized: false,
    })
    .end()

  const [response] = await toWebResponse(request)
  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original')

  expect(targetRequestListener).toHaveBeenCalledOnce()
})
