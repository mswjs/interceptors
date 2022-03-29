/**
 * @jest-environment jsdom
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { createXMLHttpRequest } from '../../../helpers'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/account', (req, res) => {
      return res
        .status(200)
        .append('access-control-expose-headers', 'x-response-type')
        .append('x-response-type', 'bypass')
        .send()
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
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
