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
    controller.respondWith(new Response('hello world', { status: 429 }))
  })

  const response = await fetch('https://x.test/y')

  expect(response.status).toBe(429)
  await expect(response.body!.cancel()).resolves.toBeUndefined()
})

it('cancels a mocked response body with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world', { status: 429 }))
  })
  interceptor.on('response', () => {})

  const response = await fetch('https://x.test/y')

  expect(response.status).toBe(429)
  await expect(response.body!.cancel()).resolves.toBeUndefined()
})

it('reads the caller response after a listener cancels its response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })
  interceptor.on('response', async ({ response }) => {
    await expect(response.body!.cancel()).resolves.toBeUndefined()
  })

  const response = await fetch('https://x.test/y')
  await expect(response.text()).resolves.toBe('hello world')
})

it('cancels a mocked response reader with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world', { status: 429 }))
  })
  interceptor.on('response', () => {})

  const response = await fetch('https://x.test/y')
  const reader = response.body!.getReader()
  onTestFinished(() => reader.releaseLock())

  await expect(reader.cancel()).resolves.toBeUndefined()
})

it('returns from a mocked response iterator with a response listener', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world', { status: 429 }))
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
    controller.respondWith(new Response('hello world', { status: 429 }))
  })
  interceptor.on('response', async ({ response }) => {
    await expect(response.text()).resolves.toBe('hello world')
  })

  const response = await fetch('https://x.test/y')
  const reader = response.body!.getReader()
  onTestFinished(() => reader.releaseLock())

  await expect(reader.cancel()).resolves.toBeUndefined()
})

it('cancels an original response reader and reads the next response', async () => {
  interceptor.on('response', () => {})

  const response = await fetch(server.http.url('/'), {
    method: 'POST',
    body: 'original',
  })
  const reader = response.body!.getReader()
  onTestFinished(() => reader.releaseLock())

  await expect(reader.cancel()).resolves.toBeUndefined()

  const nextResponse = await fetch(server.http.url('/'), {
    method: 'POST',
    body: 'next response',
  })

  await expect(nextResponse.text()).resolves.toBe('next response')
})

it.skipIf(typeof window === 'undefined')(
  'cancels both branches while a response listener holds a reader',
  async () => {
    const cancel = vi.fn()
    const observer =
      Promise.withResolvers<ReadableStreamDefaultReader<Uint8Array>>()
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(
        new Response(
          new ReadableStream({
            cancel(reason) {
              cancel(reason)
            },
          })
        )
      )
    })
    interceptor.on('response', ({ response }) => {
      const reader = response.body!.getReader()
      onTestFinished(() => reader.releaseLock())
      observer.resolve(reader)
    })

    const response = await fetch('https://x.test/y')
    const observerReader = await observer.promise
    const pendingRead = observerReader.read()

    await expect(response.body!.cancel('retry')).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(['retry', 'retry'])
    await expect(pendingRead).resolves.toEqual({
      done: true,
      value: undefined,
    })
  }
)
