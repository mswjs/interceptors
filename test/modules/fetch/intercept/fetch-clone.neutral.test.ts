import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

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

it('does not lock the original response when the request is cloned', async () => {
  interceptor.on('request', async ({ request }) => {
    // Intentionally don't mock any responses so that
    // the original response is sent. Cloning the request
    // must have no effect on reading the response.
    await request.clone().text()
  })

  const response = await fetch(server.http.url('/resource'))

  await expect(response.text()).resolves.toBe('original-response')
})
