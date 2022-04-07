/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

interface ResponseType {
  requestRawHeaders: string[]
}

const httpServer = new HttpServer((app) => {
  app.get<never, ResponseType>('/', (req, res) => {
    res
      .set({
        'Access-Control-Expose-Headers':
          'x-response-type, x-client-header, x-multi-value',
        'X-Response-Type': 'bypass',
        'X-Client-Header': req.get('x-client-header'),
        'X-Multi-Value': req.get('x-multi-value'),
      })
      .json({
        requestRawHeaders: req.rawHeaders,
      })
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('sends the request headers to the server', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.setRequestHeader('X-ClienT-HeadeR', 'abc-123')
    req.setRequestHeader('X-Multi-Value', 'value1; value2')
    req.send()
  })
  const res = JSON.parse(req.responseText) as ResponseType

  // Request headers casing is preserved in the raw headers.
  expect(res.requestRawHeaders).toContain('X-ClienT-HeadeR')
  expect(res.requestRawHeaders).toContain('X-Multi-Value')

  // Normalized request headers list all headers in lower-case.
  expect(req.getResponseHeader('x-client-header')).toEqual('abc-123')
  expect(req.getResponseHeader('x-multi-value')).toEqual('value1; value2')
})
