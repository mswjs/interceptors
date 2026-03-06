// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('patches the original XMLHttpRequest response', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    const url = new URL(request.url)

    if (url.searchParams.get('type') === 'passthrough') {
      return controller.passthrough()
    }

    const originalRequest = new XMLHttpRequest()
    url.searchParams.set('type', 'passthrough')
    originalRequest.open(request.method, url.href)
    originalRequest.send(await request.text())
    await waitForXMLHttpRequest(originalRequest)

    controller.respondWith(
      new Response(`${originalRequest.responseText}-patched`)
    )
  })

  const request = new XMLHttpRequest()
  request.open('POST', server.http.url('/'))
  request.send('payload')

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.responseText).toBe('payload-patched')
})
