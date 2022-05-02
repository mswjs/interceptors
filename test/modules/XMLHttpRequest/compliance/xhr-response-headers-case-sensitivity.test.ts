/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { createXMLHttpRequest } from '../../../helpers'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'

const httpServer = new HttpServer((app) => {
  app.get('/account', (req, res) => {
    return res
      .status(200)
      .append('access-control-expose-headers', 'x-response-type')
      .append('x-response-type', 'bypass')
      .send()
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

test('ignores casing when retrieving response headers via "getResponseHeader"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/account'))
    req.send()
  })

  expect(req.getResponseHeader('x-response-type')).toEqual('bypass')
  expect(req.getResponseHeader('X-response-Type')).toEqual('bypass')
  expect(req.getResponseHeader('X-RESPONSE-TYPE')).toEqual('bypass')
})
