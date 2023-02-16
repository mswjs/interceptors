/**
 * @jest-environment jsdom
 * @see https://github.com/mswjs/msw/issues/273
 */
import { Response } from '@remix-run/web-fetch'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  if (request.url === 'https://test.mswjs.io/user') {
    request.respondWith(
      new Response(JSON.stringify({ mocked: true }), {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
          'x-header': 'yes',
        },
      })
    )
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
    req.responseType = 'json'

    req.addEventListener('load', function () {
      const { status, response } = this
      const headers = this.getAllResponseHeaders()

      expect(status).toBe(200)
      expect(headers).toContain('x-header: yes')
      expect(response).toEqual({ mocked: true })
    })
    req.send()
  })
})
