// @vitest-environment node
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('original')
      })
    },
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an HTTP request that ends after the socket has connected', async () => {
  const request = http.request(httpServer.http.url('/resource').href)
  request.on('socket', (socket) => {
    socket.on('connect', () => request.end())
  })

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('original')
})

it('mocks an HTTP request that ends after the socket has connected', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = http.request(httpServer.http.url('/mocked').href, {
    /**
     * Force no Agent so the opened socket from the previous test doesn't
     * get reused for this one. When Node.js reuses a socket, it never emits
     * the "connect" event on the socket again.
     */
    agent: false,
  })
  request.on('socket', (socket) => {
    socket.on('connect', () => request.end())
  })

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('hello world')
})
