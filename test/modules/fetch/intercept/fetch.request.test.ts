/**
 * @jest-environment node
 */
import { Request } from 'node-fetch'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { fetch } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.post('/user', (_req, res) => {
    res.status(200).send('mocked')
  })
})

const resolver = jest.fn<never, Parameters<HttpRequestEventMap['request']>>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('intercepts fetch requests constructed via a "Request" instance', async () => {
  const request = new Request(httpServer.http.url('/user'), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'interceptors',
    },
    body: 'hello world',
  })
  const { res } = await fetch(request)

  // There's no mocked response returned from the resolver
  // so this request must hit an actual (test) server.
  expect(res.status).toEqual(200)
  expect(await res.text()).toEqual('mocked')

  expect(resolver).toHaveBeenCalledTimes(1)

  const [capturedRequest, requestId] = resolver.mock.calls[0]

  expect(capturedRequest.method).toBe('POST')
  expect(capturedRequest.url).toBe(httpServer.http.url('/user'))
  expect(capturedRequest.headers).toEqual(
    headersContaining({
      'content-type': 'text/plain',
      'user-agent': 'interceptors',
    })
  )
  expect(capturedRequest.credentials).toBe('same-origin')
  expect(await capturedRequest.text()).toBe('hello world')
  expect(capturedRequest.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})
