// @vitest-environment node
import { createTestHttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { REQUEST_ID_REGEXP } from '../../../helpers'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { RequestController } from '../../../../src/RequestController'
import { DeferredPromise } from '@open-draft/deferred-promise'

const server = createTestHttpServer({
  defineRoutes(router) {
    router.all('*', () => new Response())
  },
})

function isRequestWithBody(method: string) {
  return method !== 'HEAD' && method !== 'GET'
}

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  interceptor.apply()
  await server.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it.each<[string, 'http' | 'https']>([
  ['HEAD', 'http'],
  ['GET', 'http'],
  ['POST', 'http'],
  ['PUT', 'http'],
  ['PATCH', 'http'],
  ['DELETE', 'http'],

  ['HEAD', 'https'],
  ['GET', 'https'],
  ['POST', 'https'],
  ['PUT', 'https'],
  ['PATCH', 'https'],
  ['DELETE', 'https'],
])(`intercepts a %s %s request`, async (method, protocol) => {
  const resolver = vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  const requestPromise = new DeferredPromise<Request>()
  interceptor.on('request', async (info) => {
    requestPromise.resolve(info.request.clone())
    resolver(info)
  })

  await fetch(server[protocol].url('/user?id=123'), {
    method,
    headers: {
      'x-custom-header': 'yes',
    },
    // @ts-ignore
    duplex: 'half',
    body: isRequestWithBody(method) ? 'request-payload' : null,
  })

  expect(resolver).toHaveBeenCalled()
  const request = await requestPromise
  const [{ requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe(method)
  expect(request.url).toBe(server[protocol].url('/user?id=123').href)
  expect(request.headers.get('x-custom-header')).toBe('yes')
  expect(request.credentials).toBe('same-origin')

  if (isRequestWithBody(method)) {
    await expect(request.clone().text()).resolves.toBe('request-payload')
  } else {
    expect(request.body).toBe(null)
  }

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
  expect(controller).toBeInstanceOf(RequestController)
})
