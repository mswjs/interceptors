import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { IncomingMessage } from 'http'
import https from 'https'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { getRequestOptionsByUrl } from '../../../../src/utils/getRequestOptionsByUrl'
import { SocketInterceptor } from '../../../../src/interceptors/Socket/index'

const httpServer = new HttpServer((app) => {
  app.get('/get', (req, res) => {
    res.status(200).send('/')
  })
})

const interceptor = new SocketInterceptor()
interceptor.on('request', ({ request }) => {
  if ([httpServer.https.url('/get')].includes(request.url)) {
    return
  }

  request.respondWith(
    new Response('mocked-body', {
      status: 403,
      statusText: 'Forbidden',
    })
  )
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('calls a custom callback once when the request is bypassed', async () => {
  const chunks: Array<Buffer> = []

  const responseReceived = new DeferredPromise<void>()
  const responseCallback = vi.fn<[IncomingMessage]>((response) => {
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => responseReceived.resolve())
    response.on('error', (error) => responseReceived.reject(error))
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(httpServer.https.url('/get'))),
      agent: httpsAgent,
    },
    responseCallback
  )

  await responseReceived

  // Check that the request was bypassed.
  expect(Buffer.concat(chunks).toString()).toEqual('/')

  // Custom callback to "https.get" must be called once.
  expect(responseCallback).toBeCalledTimes(1)
})

it('calls a custom callback once when the response is mocked', async () => {
  const chunks: Array<Buffer> = []

  const responseReceived = new DeferredPromise<void>()
  const responseCallback = vi.fn<[IncomingMessage]>((response) => {
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => responseReceived.resolve())
    response.on('error', (error) => responseReceived.reject(error))
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(httpServer.https.url('/arbitrary'))),
      agent: httpsAgent,
    },
    responseCallback
  )

  await responseReceived

  // Check that the response was mocked.
  expect(Buffer.concat(chunks).toString()).toEqual('mocked-body')

  // Custom callback to `https.get` must be called once.
  expect(responseCallback).toBeCalledTimes(1)
})
