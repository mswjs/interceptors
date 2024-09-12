// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { Request } from 'node-fetch'
import { createTestHttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { fetch, REQUEST_ID_REGEXP } from '../../../helpers'
import { RequestController } from '../../../../src/RequestController'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const server = createTestHttpServer({
  defineRoutes(router) {
    router.post('/user', () => {
      return new Response('mocked')
    })
  },
})

const resolver = vi.fn<HttpRequestEventMap['request']>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it('intercepts fetch requests constructed via a "Request" instance', async () => {
  const request = new Request(server.http.url('/user'), {
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

  const [{ request: capturedRequest, requestId, controller }] =
    resolver.mock.calls[0]

  expect(capturedRequest.method).toBe('POST')
  expect(capturedRequest.url).toBe(server.http.url('/user').href)
  expect(Object.fromEntries(capturedRequest.headers.entries())).toMatchObject({
    'content-type': 'text/plain',
    'user-agent': 'interceptors',
  })
  expect(capturedRequest.credentials).toBe('same-origin')
  expect(await capturedRequest.text()).toBe('hello world')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
