import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const interceptor = new FetchInterceptor()
const server = getTestServer()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('cancels a mocked response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ a: 1 }, { status: 429 }))
  })

  const response = await fetch('https://x.test/y')

  expect(response.status).toBe(429)
  await expect(response.body!.cancel()).resolves.toBeUndefined()
})

it('cancels a mocked response body with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ a: 1 }, { status: 429 }))
  })
  interceptor.on('response', () => {})

  const response = await fetch('https://x.test/y')

  expect(response.status).toBe(429)
  await expect(response.body!.cancel()).resolves.toBeUndefined()
})

it('cancels a mocked response reader with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ a: 1 }, { status: 429 }))
  })
  interceptor.on('response', () => {})

  const response = await fetch('https://x.test/y')
  const reader = response.body!.getReader()

  await expect(reader.cancel()).resolves.toBeUndefined()
  reader.releaseLock()
})

it('returns from a mocked response iterator with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ a: 1 }, { status: 429 }))
  })
  interceptor.on('response', () => {})

  const response = await fetch('https://x.test/y')
  const iterator = response.body![Symbol.asyncIterator]()

  await expect(iterator.return!()).resolves.toEqual({
    done: true,
    value: undefined,
  })
})

it('cancels a mocked response reader after the response listener reads its body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ a: 1 }, { status: 429 }))
  })
  interceptor.on('response', async ({ response }) => {
    await expect(response.json()).resolves.toEqual({ a: 1 })
  })

  const response = await fetch('https://x.test/y')
  const reader = response.body!.getReader()

  await expect(reader.cancel()).resolves.toBeUndefined()
  reader.releaseLock()
})

it('cancels an original response reader and reads the next response', async () => {
  interceptor.on('response', () => {})

  const response = await fetch(server.http.url('/'), {
    method: 'POST',
    body: 'original',
  })
  const reader = response.body!.getReader()

  await expect(reader.cancel()).resolves.toBeUndefined()
  reader.releaseLock()

  const nextResponse = await fetch(server.http.url('/'), {
    method: 'POST',
    body: 'next response',
  })

  await expect(nextResponse.text()).resolves.toBe('next response')
})
