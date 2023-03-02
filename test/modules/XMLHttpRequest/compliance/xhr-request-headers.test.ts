// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'

interface ResponseType {
  requestRawHeaders: Array<string>
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get<never, ResponseType>('/', (req, res) => {
    res
      .set({
        'Access-Control-Expose-Headers':
          'x-response-type, x-client-header, x-multi-value',
        'X-Response-Type': 'bypass',
        'X-Client-Header': req.get('x-client-header'),
        'X-Multi-Value': req.get('x-multi-value'),
      })
      .end()
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

it('sends the request headers to the server', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.setRequestHeader('X-ClienT-HeadeR', 'abc-123')
    req.setRequestHeader('X-Multi-Value', 'value1; value2')
    req.send()
  })

  // Normalized request headers list all headers in lower-case.
  expect(req.getResponseHeader('x-client-header')).toEqual('abc-123')
  expect(req.getResponseHeader('x-multi-value')).toEqual('value1; value2')
})
