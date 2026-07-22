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

it('awaits response listener promise before resolving the mocked response promise', async () => {
  const markStep = vi.fn<(event: string) => void>()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  interceptor.on('response', async ({ response }) => {
    markStep('before-response')
    await response.text()
    markStep('after-response')
  })

  markStep('before-fetch')
  await fetch(server.http.url('/resource'))
  markStep('after-fetch')

  expect(markStep.mock.calls).toEqual([
    ['before-fetch'],
    ['before-response'],
    ['after-response'],
    ['after-fetch'],
  ])
})

it('awaits response listener promise before resolving the original response promise', async () => {
  const markStep = vi.fn<(event: string) => void>()

  interceptor.on('response', async ({ response }) => {
    markStep('before-response')
    await response.text()
    markStep('after-response')
  })

  markStep('before-fetch')
  await fetch(server.http.url('/resource'))
  markStep('after-fetch')

  expect(markStep.mock.calls).toEqual([
    ['before-fetch'],
    ['before-response'],
    ['after-response'],
    ['after-fetch'],
  ])
})
