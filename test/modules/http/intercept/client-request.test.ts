import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { RequestController } from '../../../../src/RequestController'
import { HttpRequestEventMap } from '../../../../src/glossary'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const resolver = vi.fn<HttpRequestEventMap['request']>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts a ClientRequest request with options', async () => {
  const url = new URL(httpServer.http.url('/user?id=123'))

  // send options object instead of (url, options) as in other tests
  // because the @types/node is incorrect and does not have the correct signature
  const req = new http.ClientRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})
