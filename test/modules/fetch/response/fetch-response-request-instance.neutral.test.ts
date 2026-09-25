import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits the same request instance on the "request" and "response" events for a bypassed request', async () => {
  const requestListener = vi.fn<(request: Request) => void>()
  const responseListener = vi.fn<(request: Request) => void>()

  interceptor.on('request', ({ request }) => {
    requestListener(request)
  })
  interceptor.on('response', ({ request }) => {
    responseListener(request)
  })

  await fetch(server.http.url('/resource'), {
    method: 'POST',
    body: 'hello world',
  })

  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(responseListener).toHaveBeenCalledTimes(1)

  const [requestFromRequestEvent] = requestListener.mock.calls[0]
  const [requestFromResponseEvent] = responseListener.mock.calls[0]

  expect(requestFromResponseEvent).toBe(requestFromRequestEvent)
})

it('emits the same request instance on the "request" and "response" events for a mocked request', async () => {
  const requestListener = vi.fn<(request: Request) => void>()
  const responseListener = vi.fn<(request: Request) => void>()

  interceptor.on('request', ({ request, controller }) => {
    requestListener(request)
    controller.respondWith(new Response('hello world'))
  })
  interceptor.on('response', ({ request }) => {
    responseListener(request)
  })

  await fetch('http://localhost/irrelevant')

  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(responseListener).toHaveBeenCalledTimes(1)

  const [requestFromRequestEvent] = requestListener.mock.calls[0]
  const [requestFromResponseEvent] = responseListener.mock.calls[0]

  expect(requestFromResponseEvent).toBe(requestFromRequestEvent)
})

it('keeps the request body readable in the "response" listener for a bypassed request', async () => {
  const requestBodyPromise = Promise.withResolvers<string>()

  interceptor.on('response', ({ request }) => {
    requestBodyPromise.resolve(request.text())
  })

  const response = await fetch(server.http.url('/resource'), {
    method: 'POST',
    body: 'hello world',
  })

  // The test server echoes the request body.
  await expect(response.text()).resolves.toBe('hello world')
  await expect(requestBodyPromise.promise).resolves.toBe('hello world')
})
