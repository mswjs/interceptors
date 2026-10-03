// @vitest-environment node
import net from 'node:net'
import http2 from 'node:http2'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { HttpRequestEventMap } from '#/src/events/http'
import { RequestController } from '#/src/request-controller'
import {
  REQUEST_ID_REGEXP,
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits the "request" event for a request without a body', async () => {
  const requestListener =
    vi.fn<(event: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  await toHttp2WebResponse(
    session.request({ ':path': '/resource', 'x-custom-header': 'yes' })
  )

  expect(requestListener).toHaveBeenCalledOnce()

  const { request, requestId, controller } = requestListener.mock.calls[0][0]
  expect.soft(request).toBeInstanceOf(Request)
  expect.soft(request.method).toBe('GET')
  expect.soft(request.url).toBe('http://api.example.com/resource')
  expect.soft(request.headers.get('x-custom-header')).toBe('yes')
  expect.soft(request.body).toBe(null)
  expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
  expect.soft(controller).toBeInstanceOf(RequestController)
})

it('emits the "request" event for a request with a body', async () => {
  const requestBodyListener = vi.fn<(body: string) => void>()
  interceptor.on('request', async ({ request, controller }) => {
    requestBodyListener(await request.clone().text())
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({
    ':method': 'POST',
    ':path': '/resource',
    'content-type': 'text/plain',
  })
  stream.end('post-payload')
  await toHttp2WebResponse(stream)

  expect(requestBodyListener).toHaveBeenCalledExactlyOnceWith('post-payload')
})

it('emits the "response" event for a mocked response', async () => {
  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world', { status: 201 }))
  })
  interceptor.on('response', responseListener)

  await using session = connectHttp2Session('http://api.example.com')
  await toHttp2WebResponse(session.request({ ':path': '/resource' }))

  expect(responseListener).toHaveBeenCalledOnce()

  const { response, responseType, request, requestId } =
    responseListener.mock.calls[0][0]
  expect.soft(response).toBeInstanceOf(Response)
  expect.soft(response.status).toBe(201)
  expect.soft(responseType).toBe('mock')
  expect.soft(request.url).toBe('http://api.example.com/resource')
  expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
  await expect(response.text()).resolves.toBe('hello world')
})

it('emits the "response" event for the original response', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(202, { 'x-original': 'yes' }).end('original-response')
    })
  })

  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  await using session = connectHttp2Session(server.http.url('/'))
  await toHttp2WebResponse(session.request({ ':path': '/resource' }))

  expect(responseListener).toHaveBeenCalledOnce()

  const { response, responseType, request, requestId } =
    responseListener.mock.calls[0][0]
  expect.soft(response).toBeInstanceOf(Response)
  expect.soft(response.status).toBe(202)
  expect.soft(response.headers.get('x-original')).toBe('yes')
  expect.soft(responseType).toBe('original')
  expect.soft(request.url).toBe(server.http.url('/resource').href)
  expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
  await expect(response.text()).resolves.toBe('original-response')
})

it('shares the request id between the "request" and "response" events', async () => {
  const requestIds: Array<string> = []
  interceptor.on('request', ({ requestId, controller }) => {
    requestIds.push(requestId)
    controller.respondWith(new Response('hello world'))
  })
  interceptor.on('response', ({ requestId }) => {
    requestIds.push(requestId)
  })

  await using session = connectHttp2Session('http://api.example.com')
  await toHttp2WebResponse(session.request({ ':path': '/resource' }))

  expect(requestIds).toHaveLength(2)
  expect(requestIds[0]).toBe(requestIds[1])
})

it('exposes no body in the "response" event for an original response without one', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(204).end()
    })
  })

  const responseListener =
    vi.fn<(event: HttpRequestEventMap['response']) => void>()
  interceptor.on('response', responseListener)

  await using session = connectHttp2Session(server.http.url('/'))
  await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(responseListener).toHaveBeenCalledOnce()

  const { response } = responseListener.mock.calls[0][0]
  expect.soft(response.status).toBe(204)
  expect.soft(response.body).toBe(null)
})

it('does not emit the "response" event for a request errored by the listener', async () => {
  const responseListener = vi.fn()
  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('Custom error'))
  })
  interceptor.on('response', responseListener)

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const streamCloseListener = vi.fn()
  stream.on('error', () => {})
  stream.on('close', streamCloseListener)

  await expect.poll(() => streamCloseListener).toHaveBeenCalledOnce()
  expect(responseListener).not.toHaveBeenCalled()
})

it('exposes the socket of the connection as the request initiator', async () => {
  const requestListener =
    vi.fn<(event: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(requestListener).toHaveBeenCalledOnce()
  expect(requestListener.mock.calls[0][0].initiator).toBeInstanceOf(net.Socket)
})
