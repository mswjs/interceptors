import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { IncomingMessage } from 'http'
import https from 'https'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { getRequestOptionsByUrl } from '../../../../src/utils/getRequestOptionsByUrl'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'

const httpServer = new HttpServer((app) => {
  app.get('/get', (req, res) => {
    res.status(200).send('/').end()
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
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
  let text: string = ''

  const responseReceived = new DeferredPromise<void>()
  const responseCallback = vi.fn<[IncomingMessage]>((res) => {
    res.on('data', (chunk) => (text += chunk))
    res.on('end', () => responseReceived.resolve())
    res.on('error', (error) => responseReceived.reject(error))
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
  expect(text).toEqual('/')

  // Custom callback to "https.get" must be called once.
  expect(responseCallback).toBeCalledTimes(1)
})

it('calls a custom callback once when the response is mocked', async () => {
  let text: string = ''

  const responseReceived = new DeferredPromise<void>()
  const responseCallback = vi.fn<[IncomingMessage]>((res) => {
    res.on('data', (chunk) => (text += chunk))
    res.on('end', () => responseReceived.resolve())
    res.on('error', (error) => responseReceived.reject(error))
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
  expect(text).toEqual('mocked-body')

  // Custom callback to `https.get` must be called once.
  expect(responseCallback).toBeCalledTimes(1)
})
