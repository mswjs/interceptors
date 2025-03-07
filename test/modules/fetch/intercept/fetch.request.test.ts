import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { REQUEST_ID_REGEXP } from '../../../helpers'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { RequestController } from '../../../../src/RequestController'

const httpServer = new HttpServer((app) => {
  app.post('/user', (_req, res) => {
    res.status(200).send('mocked')
  })
})

const resolver = vi.fn<(...args: HttpRequestEventMap['request']) => void>()

const interceptor = new FetchInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts fetch requests constructed via a "Request" instance', async () => {
  const request = new Request(httpServer.http.url('/user'), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'interceptors',
    },
    body: 'hello world',
  })
  const response = await fetch(request)

  // There's no mocked response returned from the resolver
  // so this request must hit an actual (test) server.
  expect(response.status).toEqual(200)
  await expect(response.text()).resolves.toEqual('mocked')

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request: capturedRequest, requestId, controller }] =
    resolver.mock.calls[0]

  expect(capturedRequest.method).toBe('POST')
  expect(capturedRequest.url).toBe(httpServer.http.url('/user'))
  expect(Object.fromEntries(capturedRequest.headers.entries())).toMatchObject({
    'content-type': 'text/plain',
    'user-agent': 'interceptors',
  })
  expect(capturedRequest.credentials).toBe('same-origin')
  await expect(capturedRequest.text()).resolves.toBe('hello world')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
