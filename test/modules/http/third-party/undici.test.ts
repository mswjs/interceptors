// @vitest-environment node
import { fetch, Pool, request } from 'undici'
import { HttpServer } from '@open-draft/test-server/http'
import { Interceptor } from '#/src/interceptor'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { SocketInterceptor } from '#/src/interceptors/net'
import { SocketController } from '#/src/interceptors/net/socket-controller'

const interceptor = new HttpRequestInterceptor()
const socketInterceptor = Interceptor.singleton(SocketInterceptor)
const httpServer = new HttpServer((app) => {
  app.get('/resource/*', (request, response) => {
    response.status(200).send('original')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('mocks an HTTP request made with "fetch"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await fetch('http://any.host.here/api')

  expect.soft(response.status).toBe(200)
  expect.soft(Object.fromEntries(response.headers)).toEqual({
    'content-type': 'text/plain;charset=UTF-8',
    'x-custom-header': 'yes',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})

it('mocks an HTTPS request made with "fetch"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await fetch('https://any.host.here/api')

  expect.soft(response.status).toBe(200)
  expect.soft(Object.fromEntries(response.headers)).toEqual({
    'content-type': 'text/plain;charset=UTF-8',
    'x-custom-header': 'yes',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})

it('mocks an HTTP request made with "request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await request('http://any.host.here/api')

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.headers).toEqual({
    'content-type': 'text/plain;charset=UTF-8',
    'x-custom-header': 'yes',
  })
  await expect.soft(response.body.text()).resolves.toBe('hello world')
})

it('mocks an HTTPS request made with "request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await request('https://any.host.here/api')

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.headers).toEqual({
    'content-type': 'text/plain;charset=UTF-8',
    'x-custom-header': 'yes',
  })
  await expect.soft(response.body.text()).resolves.toBe('hello world')
})

it('starts a subsequent request on a pooled connection as pending', async () => {
  const requestListener = vi.fn()
  const requestSocketStates: Array<number> = []
  const pool = new Pool(httpServer.http.url(), {
    connections: 1,
  })

  socketInterceptor.once('connection', ({ socket, controller }) => {
    socket.on('data', () => {
      requestSocketStates.push(controller['readyState'])
    })
  })

  interceptor.on('request', ({ request }) => {
    requestListener(request.url)
  })

  const firstResponse = await pool.request({
    method: 'GET',
    path: '/resource/original',
  })
  await expect(firstResponse.body.text()).resolves.toBe('original')

  const secondResponse = await pool.request({
    method: 'GET',
    path: '/resource/subsequent',
  })
  await expect(secondResponse.body.text()).resolves.toBe('original')

  await pool.close()

  expect(requestListener).toHaveBeenCalledTimes(2)
  expect(requestSocketStates).toEqual([
    SocketController.PENDING,
    SocketController.PENDING,
  ])
})
