// @vitest-environment jsdom
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(Response.error())
})

beforeAll(async () => {
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
})

it('treats "Response.error()" as request error', async () => {
  const requestErrorListener = vi.fn()

  const request = new XMLHttpRequest()
  request.open('GET', 'http://localhost:3001/resource')
  request.addEventListener('error', requestErrorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  // Request must reflect the request error state.
  expect(request.readyState).toBe(request.DONE)
  expect(request.status).toBe(0)
  expect(request.statusText).toBe('')
  expect(request.response).toBe('')

  // Network error must propagate to the "error" request event.
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})
