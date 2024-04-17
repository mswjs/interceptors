// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { FetchInterceptor } from '../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => void 0)

  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  vi.restoreAllMocks()
  interceptor.dispose()
})

it('treats middleware exceptions as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Network error')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  expect(await response.json()).toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})

it('treats a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('hello world')
})

it('treats Response.error() as a network error', async () => {
  interceptor.on('request', ({ request }) => {
    request.respondWith(Response.error())
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('TypeError')
  expect(requestError.message).toBe('Failed to fetch')
  expect(requestError.cause).toBeInstanceOf(Response)
})
