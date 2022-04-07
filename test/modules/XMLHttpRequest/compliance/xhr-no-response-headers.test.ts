/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/user', (_req, res) => {
    // Respond with a message that has no headers.
    res.socket?.end(`\
HTTP/1.1 200 OK

hello world`)
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()

  /**
   * @note Stub the internal JSDOM property to prevent the following error:
   * Error: Cross origin http://127.0.0.1:XXXXX/ forbidden
   */
  const { protocol, host, port } = httpServer.http.address
  // @ts-expect-error
  window._origin = `${protocol}//${host}:${port}`
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('handles an original response without any headers', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/user'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.statusText).toEqual('OK')
  expect(req.responseText).toEqual('hello world')
  expect(req.getAllResponseHeaders()).toEqual('')
})
