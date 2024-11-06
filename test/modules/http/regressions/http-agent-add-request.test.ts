/**
 * @see https://github.com/mswjs/msw/issues/2338
 */
// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('respects a custom "addRequest" method on the http agent', async () => {
  const interceptedRequestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request, controller }) => {
    interceptedRequestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  /**
   * A custom HTTP agent that adds a "cookie" header to
   * any outgoing request.
   */
  class CustomAgent extends http.Agent {
    addRequest(request: http.ClientRequest) {
      request.setHeader('cookie', 'key=value')
    }
  }

  const request = http.get('http://localhost/resource', {
    agent: new CustomAgent(),
  })
  await waitForClientRequest(request)

  const interceptedRequest = await interceptedRequestPromise

  // Must have the cookie header set by the custom agent.
  expect(Object.fromEntries(interceptedRequest.headers)).toEqual(
    expect.objectContaining({
      cookie: 'key=value',
    })
  )
})

it('respects a custom "addRequest" method on the https agent', async () => {
  const interceptedRequestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request, controller }) => {
    interceptedRequestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  /**
   * A custom HTTP agent that adds a "cookie" header to
   * any outgoing request.
   */
  class CustomAgent extends https.Agent {
    addRequest(request: http.ClientRequest) {
      request.setHeader('cookie', 'key=value')
    }
  }

  const request = https.get('https://localhost/resource', {
    agent: new CustomAgent(),
  })
  await waitForClientRequest(request)

  const interceptedRequest = await interceptedRequestPromise

  // Must have the cookie header set by the custom agent.
  expect(Object.fromEntries(interceptedRequest.headers)).toEqual(
    expect.objectContaining({
      cookie: 'key=value',
    })
  )
})
