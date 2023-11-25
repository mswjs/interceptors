// @vitest-environment react-native-like
import { it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a request with an absolute URL', async () => {
  interceptor.once('request', ({ request }) => {
    request.respondWith(new Response('Hello world'))
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'https://example.com/resource')
    request.send()
  })

  expect(request.status).toBe(200)
  expect(request.response).toBe('Hello world')
})

it('throws on a request with a relative URL', async () => {
  const createRequest = () => {
    return createXMLHttpRequest((request) => {
      /**
       * @note Since the "location" is not present in React Native,
       * relative requests will throw (nothing to be relative to).
       * This is the correct behavior in React Native, where relative
       * requests are a no-op.
       */
      request.open('GET', '/relative/url')
      request.send()
    })
  }

  expect(createRequest).toThrow('Invalid URL: /relative/url')
})
