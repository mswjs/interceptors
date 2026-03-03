// @vitest-environment jsdom
import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from '#/test/helpers'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
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
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('ignores casing when retrieving response headers via "getResponseHeader"', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/account'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getResponseHeader('x-response-type')).toEqual('bypass')
  expect(request.getResponseHeader('X-response-Type')).toEqual('bypass')
  expect(request.getResponseHeader('X-RESPONSE-TYPE')).toEqual('bypass')
})
