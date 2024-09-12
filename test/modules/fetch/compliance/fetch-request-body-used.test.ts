// @vitest-environment node
import { DeferredPromise } from '@open-draft/deferred-promise'
import { createTestHttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()
const server = createTestHttpServer({
  defineRoutes(router) {
    router.post('/resource', async ({ req }) => {
      return new Response('received: ' + (await req.text()))
    })
  },
})

beforeAll(async () => {
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

it('request body is unused in the listener when using Request argument', async () => {
  const requestInListenerPromise = new DeferredPromise<Request>()
  interceptor.on('request', ({ request }) => {
    requestInListenerPromise.resolve(request)
  })

  const request = new Request(server.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })
  const bodyUsedBeforeFetch = request.bodyUsed

  const responsePromise = fetch(request)
  const bodyUsedAfterFetch = request.bodyUsed

  const requestInListener = await requestInListenerPromise
  const bodyUsedInListener = requestInListener.bodyUsed

  const response = await responsePromise
  const bodyUsedAfterResponse = request.bodyUsed

  expect(bodyUsedBeforeFetch).toBe(false)
  expect(bodyUsedInListener).toBe(false)
  // Fetch reads the request body in order to send it.
  expect(bodyUsedAfterFetch).toBe(true)
  expect(bodyUsedAfterResponse).toBe(true)

  expect(await response.text()).toBe('received: Hello server')
})

it('request body is unused in the listener when using input and init arguments', async () => {
  const requestInListenerPromise = new DeferredPromise<Request>()
  interceptor.on('request', ({ request }) => {
    requestInListenerPromise.resolve(request)
  })

  const responsePromise = fetch(server.http.url('/resource'), {
    method: 'POST',
    body: 'Hello server',
  })

  const requestInListener = await requestInListenerPromise
  const bodyUsedInListener = requestInListener.bodyUsed

  const response = await responsePromise

  expect(bodyUsedInListener).toBe(false)
  expect(await response.text()).toBe('received: Hello server')
})
