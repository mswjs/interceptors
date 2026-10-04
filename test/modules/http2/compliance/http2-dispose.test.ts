// @vitest-environment node
import http2 from 'node:http2'
import { setTimeout as sleep } from 'node:timers/promises'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

it('performs the requests as-is once the interceptor is disposed of', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const interceptor = new Http2RequestInterceptor()
  interceptor.apply()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-response'))
  })

  {
    await using session = connectHttp2Session(server.http.url('/'))
    const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
    await expect(response.text()).resolves.toBe('mocked-response')
  }

  interceptor.dispose()

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  await expect(response.text()).resolves.toBe('original-response')
})

it('closes an intercepted session once the interceptor is disposed of', async () => {
  const interceptor = new Http2RequestInterceptor()
  interceptor.apply()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-response'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const closeListener = vi.fn()
  session.on('close', closeListener)

  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  await expect(response.text()).resolves.toBe('mocked-response')

  interceptor.dispose()

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
})

it('finishes the request in flight once the interceptor is disposed of', async () => {
  const interceptor = new Http2RequestInterceptor()
  interceptor.apply()

  const pendingRequest = Promise.withResolvers<void>()
  interceptor.on('request', async ({ controller }) => {
    pendingRequest.resolve()
    await sleep(100)
    controller.respondWith(new Response('mocked-response'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const pendingResponse = toHttp2WebResponse(session.request({ ':path': '/' }))

  await pendingRequest.promise
  interceptor.dispose()

  const response = await pendingResponse
  await expect(response.text()).resolves.toBe('mocked-response')
})
