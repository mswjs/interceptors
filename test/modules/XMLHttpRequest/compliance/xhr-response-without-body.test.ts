// @vitest-environment happy-dom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import type { HttpRequestEventMap } from '#/src/index'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/:statusCode', (req, res) =>
    res.status(+req.params.statusCode).end()
  )
})

const interceptor = new XMLHttpRequestInterceptor()

const responseListener =
  vi.fn<(...args: HttpRequestEventMap['response']) => void>()

interceptor.on('response', responseListener)

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

it('supports a 204 response withouth body for a bypassed request', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/204'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      response: expect.objectContaining({
        status: 204,
        body: null,
      } satisfies Partial<Response>),
    })
  )
  expect(responseListener).toHaveBeenCalledOnce()
})

it('supports a 202 response withouth body for a bypassed request', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/205'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      response: expect.objectContaining({
        status: 205,
        body: null,
      } satisfies Partial<Response>),
    })
  )
})

it('represents a 304 response without body using fetch api response', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/304'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      response: expect.objectContaining({
        status: 304,
        body: null,
      } satisfies Partial<Response>),
    })
  )
})
