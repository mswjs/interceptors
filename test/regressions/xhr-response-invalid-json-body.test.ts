import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { createXMLHttpRequest } from '../helpers'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor({
    modules: withDefaultInterceptors,
  })
  interceptor.use((req) => {
    switch (req.url.pathname) {
      case '/no-body': {
        return {
          status: 204,
        }
      }

      case '/invalid-json': {
        return {
          headers: {
            'Content-Type': 'application/json',
          },
          body: `{"invalid: js'on`,
        }
      }
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('handles response of type "json" and missing response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', '/no-body')
    req.responseType = 'json'
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
  })

  expect(req).toHaveProperty('response', null)
  expect(req).toHaveProperty('responseText', `{"invalid: js'on`)
  expect(req).toHaveProperty('responseType', 'json')
})
