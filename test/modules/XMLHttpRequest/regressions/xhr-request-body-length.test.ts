// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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

it('does not lock the request body stream when calculating the body size', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    // Read the request body in the interceptor.
    const buffer = await request.arrayBuffer()
    controller.respondWith(new Response(buffer))
  })

  const uploadLoadStartListener = vi.fn()
  const request = new XMLHttpRequest()
  request.upload.addEventListener('loadstart', uploadLoadStartListener)
  request.open('POST', '/resource')
  request.send('request-body')

  await waitForXMLHttpRequest(request)

  // Must calculate the total request body size for the upload event.
  const progressEvent = uploadLoadStartListener.mock.calls[0][0]
  expect(progressEvent.total).toBe(12)

  // Must be able to read the request in the interceptor
  // and use its body as the mocked response body.
  expect(request.responseText).toBe('request-body')
})
