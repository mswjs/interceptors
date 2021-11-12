/**
 * @jest-environment jsdom
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

interface ResponseType {
  requestRawHeaders: string[]
}

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
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

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('sends the request headers to the server', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/'))
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
