import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { createXMLHttpRequest } from '../helpers'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'

let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/account', (req, res) => {
      return res
        .status(200)
        .append('access-control-expose-headers', 'x-response-header')
        .append('x-response-header', req.get('x-request-header'))
        .send('account-detail')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('getResponseHeader is case insensitive', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.makeUrl('/account'))
    request.setRequestHeader('x-request-header', 'test-value')
  })

  expect(request.getResponseHeader('x-response-header')).toEqual('test-value')
  expect(request.getResponseHeader('X-response-Header')).toEqual('test-value')
  expect(request.getResponseHeader('X-RESPONSE-HEADER')).toEqual('test-value')
})
