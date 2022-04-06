/**
 * @jest-environment jsdom
 */
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  switch (request.url.pathname) {
    case '/no-body': {
      request.respondWith({
        status: 204,
      })
      break
    }

    case '/invalid-json': {
      request.respondWith({
        headers: {
          'Content-Type': 'application/json',
        },
        body: `{"invalid: js'on`,
      })
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

test('handles response of type "json" and missing response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', '/no-body')
    req.responseType = 'json'
    req.send()
  })

  // When XHR fails to parse a given response JSON body,
  // fall back to null, as the failed JSON parsing result.
  expect(req.response).toBe(null)
  expect(req.responseText).toBe('')
  expect(req.responseType).toBe('json')
})

test('handles response of type "json" and invalid response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/invalid-json')
    req.responseType = 'json'
    req.send()
  })

  expect(req.response).toBe(null)
  expect(req.responseText).toBe(`{"invalid: js'on`)
  expect(req.responseType).toEqual('json')
})
