// @vitest-environment happy-dom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/'))
  request.setRequestHeader('X-ClienT-HeadeR', 'abc-123')
  request.setRequestHeader('X-Multi-Value', 'value1; value2')
  request.send()

  await waitForXMLHttpRequest(request)

  // Normalized request headers list all headers in lower-case.
  expect(request.getResponseHeader('x-client-header')).toEqual('abc-123')
  expect(request.getResponseHeader('x-multi-value')).toEqual('value1; value2')
})
