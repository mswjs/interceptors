/**
 * @jest-environment jsdom
 */
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(event) {
    switch (event.request.url.pathname) {
      case '/no-body': {
        event.respondWith({
          status: 204,
        })
        break
      }

      case '/invalid-json': {
        event.respondWith({
          headers: {
            'Content-Type': 'application/json',
          },
          body: `{"invalid: js'on`,
        })
        break
      }
    }
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('handles response of type "json" and missing response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', '/no-body')
    req.responseType = 'json'
    req.send()
  })

  // When XHR fails to parse a given response JSON body,
  // fall back to null, as the failed JSON parsing result.
  expect(req).toHaveProperty('response', null)
  expect(req).toHaveProperty('responseText', '')
  expect(req).toHaveProperty('responseType', 'json')
})

test('handles response of type "json" and invalid response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/invalid-json')
    req.responseType = 'json'
    req.send()
  })

  expect(req).toHaveProperty('response', null)
  expect(req).toHaveProperty('responseText', `{"invalid: js'on`)
  expect(req).toHaveProperty('responseType', 'json')
})
