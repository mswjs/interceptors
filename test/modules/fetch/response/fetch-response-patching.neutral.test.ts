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

it('patches the original response', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    const url = new URL(request.url)

    if (url.searchParams.get('passthrough') === '1') {
      return controller.passthrough()
    }

    url.searchParams.set('passthrough', '1')
    const originalResponse = await fetch(
      new Request(url, {
        method: request.method,
        headers: request.headers,
        /**
         * @note Read the request's body to prevent Chrome from throwing
         * "TypeError: Failed to fetch" due to refusing to send a streaming
         * request body over HTTP/1.1.
         */
        body: await request.text(),
      })
    )
    const originalData = await originalResponse.json()

    controller.respondWith(
      Response.json({
        ...originalData,
        mock: true,
      })
    )
  })

  const response = await fetch(server.http.url('/'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: 'hello world' }),
  })

  expect.soft(response.status).toBe(200)
  await expect.soft(response.json()).resolves.toEqual({
    message: 'hello world',
    mock: true,
  })
})
