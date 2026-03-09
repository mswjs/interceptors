// @vitest-environment happy-dom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import type { HttpRequestEventMap } from '#/src/index'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/cacheable', (req, res) => {
    if (req.headers['if-none-match'] === '"etag-value"') {
      return res.status(304).end()
    }
    res.set('ETag', '"etag-value"')
    res.set('Cache-Control', 'max-age=0, must-revalidate')
    res.status(200).send('original-response')
  })

  app.get('/:statusCode', (req, res) =>
    res.status(+req.params.statusCode).end()
  )
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts a bypassed request with a 204 response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = httpServer.http.url('/204')
  const request = new XMLHttpRequest()
  request.open('GET', url)
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

  expect(responseListener).toHaveBeenCalledTimes(2)

  // Preflight response.
  {
    const [{ request, response }] = responseListener.mock.calls[0]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(204)
    expect.soft(response.url).toBe(url)
    expect.soft(response.body).toBeNull()
  }

  {
    const [{ request, response }] = responseListener.mock.calls[1]

    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(204)
    expect.soft(response.url).toBe(url)
    expect.soft(response.body).toBeNull()
  }
})

it('intercepts a bypassed request with a 202 response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = httpServer.http.url('/205')
  const request = new XMLHttpRequest()
  request.open('GET', url)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenCalledTimes(2)

  // Preflight response.
  {
    const [{ request, response }] = responseListener.mock.calls[0]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(204)
    expect.soft(response.url).toBe(url)
    expect.soft(response.body).toBeNull()
  }

  {
    const [{ request, response }] = responseListener.mock.calls[1]

    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(205)
    expect.soft(response.url).toBe(url)
    expect.soft(response.body).toBeNull()
  }

  // expect(responseListener).toHaveBeenNthCalledWith(
  //   1,
  //   expect.objectContaining({
  //     request: expect.objectContaining<Partial<Request>>({
  //       method: 'OPTIONS',
  //     }),
  //   })
  // )
  // expect(responseListener).toHaveBeenNthCalledWith(
  //   2,
  //   expect.objectContaining({
  //     request: expect.objectContaining<Partial<Request>>({
  //       method: 'GET',
  //     }),
  //     response: expect.objectContaining<Partial<Response>>({
  //       status: 205,
  //       body: null,
  //     }),
  //   })
  // )
})

it('exposes a fetch api reference for a 304 response without body', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  const url = httpServer.http.url('/cacheable')

  // First request populates the cache with ETag + max-age=0.
  {
    const request = new XMLHttpRequest()
    request.open('GET', url)
    request.send()
    await waitForXMLHttpRequest(request)
  }

  responseListener.mockClear()

  // Second request to the same URL triggers revalidation (If-None-Match),
  // and the server responds with 304.
  const request = new XMLHttpRequest()
  request.open('GET', url)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.response).toBe('original-response')
  expect(responseListener).toHaveBeenCalledTimes(2)

  // Preflight response.
  {
    const [{ request, response }] = responseListener.mock.calls[0]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(204)
    expect.soft(response.url).toBe(url)
    expect.soft(response.body).toBeNull()
  }

  // Transparently resolved 304 from the server (HappyDOM responds from cache).
  {
    const [{ request, response }] = responseListener.mock.calls[1]

    expect.soft(request.method).toBe('GET')
    expect.soft(request.url).toBe(url)

    expect.soft(response.status).toBe(200)
    expect.soft(response.url).toBe(url)
    await expect.soft(response.text()).resolves.toBe('original-response')
  }
})
