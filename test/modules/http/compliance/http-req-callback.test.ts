/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { IncomingMessage } from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/get', (req, res) => {
    res.status(200).send('/')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  if ([httpServer.https.url('/get')].includes(request.url)) {
    return
  }

  controller.respondWith(
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
  const responseCallback = vi.fn<(response: IncomingMessage) => void>(
    (response) => {
      response.on('data', (chunk) => (text += chunk))
      response.on('end', () => responseReceived.resolve())
      response.on('error', (error) => responseReceived.reject(error))
    }
  )

  https.get(
    httpServer.https.url('/get'),
    {
      rejectUnauthorized: false,
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
  const responseCallback = vi.fn<(response: IncomingMessage) => void>(
    (response) => {
      response.on('data', (chunk) => (text += chunk))
      response.on('end', () => responseReceived.resolve())
      response.on('error', (error) => responseReceived.reject(error))
    }
  )

  https.get(
    httpServer.https.url('/arbitrary'),
    {
      rejectUnauthorized: false,
    },
    responseCallback
  )

  await responseReceived

  // Check that the response was mocked.
  expect(text).toEqual('mocked-body')

  // Custom callback to `https.get` must be called once.
  expect(responseCallback).toBeCalledTimes(1)
})
