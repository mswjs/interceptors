// @vitest-environment jsdom
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/no-body': {
      controller.respondWith(new Response(null, { status: 204 }))
      break
    }

    case '/invalid-json': {
      controller.respondWith(
        new Response(`{"invalid: js'on`, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
      break
    }
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('handles response of type "json" and missing response JSON body', async () => {
  const request = new XMLHttpRequest()
  request.open('PUT', '/no-body')
  request.responseType = 'json'
  request.send()

  await waitForXMLHttpRequest(request)

  // When XHR fails to parse a given response JSON body,
  // fall back to null, as the failed JSON parsing result.
  expect(request.response).toBe(null)
  expect(request.responseType).toBe('json')
})

it('handles response of type "json" and invalid response JSON body', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', '/invalid-json')
  request.responseType = 'json'
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe(null)
  expect(request.responseType).toEqual('json')
})
