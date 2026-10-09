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

it('emits the "response" event for a mocked redirect response before following it', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(server.http.url('/redirect/destination'), 301)
      )
    }
  })

  const responseListener = vi.fn<(status: number, url: string) => void>()
  interceptor.on('response', ({ response, request }) => {
    responseListener(response.status, request.url)
  })

  const response = await fetch(server.http.url('/original'))

  expect(response.status).toBe(200)
  expect(response.redirected).toBe(true)
  await expect(response.text()).resolves.toBe('destination-body')

  expect(responseListener).toHaveBeenCalledTimes(2)
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    301,
    server.http.url('/original').href
  )
  expect(responseListener).toHaveBeenNthCalledWith(
    2,
    200,
    server.http.url('/redirect/destination').href
  )
})
