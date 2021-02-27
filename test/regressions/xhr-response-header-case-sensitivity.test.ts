import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestInterceptor } from '../../src'
import { createXMLHttpRequest } from '../helpers'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'

let server: ServerApi
let interceptor: RequestInterceptor

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/account', (req, res) => {
      return res
        .status(200)
        .set('access-control-expose-headers', 'x-test-header')
        .set('x-test-header', req.get('x-test-header'))
        .send(null)
    })
  })

  interceptor = new RequestInterceptor({
    modules: [interceptXMLHttpRequest],
  })
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('getResponseHeader is case insensitive', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/account'))
    req.setRequestHeader('x-test-header', 'test-value')
  })

  expect(req.getResponseHeader('x-test-header')).toEqual('test-value')
  expect(req.getResponseHeader('X-Test-Header')).toEqual('test-value')
  expect(req.getResponseHeader('X-TEST-HEADER')).toEqual('test-value')
})
