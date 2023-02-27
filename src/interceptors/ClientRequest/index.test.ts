import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { Response } from '@remix-run/web-fetch'
import { ClientRequestInterceptor } from '.'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('forbids calling "respondWith" multiple times for the same request', async () => {
  const requestUrl = httpServer.http.url('/')

  interceptor.on('request', function firstRequestListener(request) {
    request.respondWith(new Response())
  })

  const secondRequestEmitted = new DeferredPromise<void>()
  interceptor.on('request', function secondRequestListener(request) {
    expect(() =>
      request.respondWith(new Response(null, { status: 301 }))
    ).toThrow(
      `Failed to respond to "GET ${requestUrl}" request: the "request" event has already been responded to.`
    )

    secondRequestEmitted.resolve()
  })

  const request = http.get(requestUrl)
  await secondRequestEmitted

  const responseReceived = new DeferredPromise<http.IncomingMessage>()
  request.on('response', (response) => {
    responseReceived.resolve(response)
  })

  const response = await responseReceived
  expect(response.statusCode).toBe(200)
  expect(response.statusMessage).toBe('')
})
