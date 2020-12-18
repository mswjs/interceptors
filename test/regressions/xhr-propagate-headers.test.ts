import { RequestInterceptor } from '../../src'
import { createXMLHttpRequest } from '../helpers'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createServer, ServerAPI } from '../utils/createServer'

let server: ServerAPI
let interceptor: RequestInterceptor

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/account', (req, res) => {
      return res
        .status(200)
        .set(
          'access-control-expose-headers',
          'x-response-type, x-client-header, x-multi-values'
        )
        .set('x-response-type', 'original')
        .set('x-client-header', req.get('x-client-header'))
        .set('x-multi-values', req.get('x-multi-values'))
        .send(null)
    })
  })

  interceptor = new RequestInterceptor([interceptXMLHttpRequest])
})

afterAll(() => {
  server.close()
  interceptor.restore()
})

test('forward the request headers to the server', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.makeHttpUrl('/account'))
    req.setRequestHeader('x-client-header', 'yes')
    req.setRequestHeader('x-multi-values', 'value1; value2')
  })

  const headers = req.getAllResponseHeaders()
  expect(headers).toContain('x-response-type: original')
  expect(headers).toContain('x-client-header: yes')
  expect(headers).toContain('x-multi-values: value1; value2')
})
