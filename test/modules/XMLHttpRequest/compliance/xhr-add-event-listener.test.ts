/**
 * @jest-environment jsdom
 * @see https://github.com/mswjs/msw/issues/273
 */
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  if (request.url.href === 'https://test.mswjs.io/user') {
    request.respondWith({
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'x-header': 'yes',
      },
      body: JSON.stringify({
        mocked: true,
      }),
    })
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

test('calls the "load" event attached via "addEventListener" with a mocked response', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', 'https://test.mswjs.io/user')
    req.addEventListener('load', function () {
      const { status, responseText } = this
      const headers = this.getAllResponseHeaders()

      expect(status).toBe(200)
      expect(headers).toContain('x-header: yes')
      expect(responseText).toBe(`{"mocked":true}`)
    })
    req.send()
  })
})
