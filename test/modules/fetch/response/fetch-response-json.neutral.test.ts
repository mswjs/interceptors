import { getTestServer } from '#/test/setup/vitest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a bypassed request with a json response', async () => {
  const response = await fetch(server.http.url('/json'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'original' }),
  })

  expect(response.status).toBe(200)
  expect(response.body).toBeInstanceOf(ReadableStream)
  await expect(response.json()).resolves.toEqual({ message: 'original' })
})

it('responds with a json response to an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ message: 'hello world' }))
  })

  const response = await fetch('http://localhost/irrelevant')

  expect(response.status).toBe(200)
  expect(response.body).toBeInstanceOf(ReadableStream)
  await expect(response.json()).resolves.toEqual({ message: 'hello world' })
})

it('responds with a json response to an HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ message: 'hello world' }))
  })

  const response = await fetch('https://localhost/irrelevant')

  expect(response.status).toBe(200)
  expect(response.body).toBeInstanceOf(ReadableStream)
  await expect(response.json()).resolves.toEqual({ message: 'hello world' })
})
