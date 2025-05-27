// @vitest-environment jsdom
import { it, expect, afterAll, afterEach, beforeAll } from 'vitest'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { BatchInterceptor, getRawRequest } from '../../src'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../../src/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '../../src/interceptors/fetch'
import { createXMLHttpRequest } from '../helpers'

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('returns a reference to a raw http.ClientRequest instance', async () => {
  const rawRequestPromise = new DeferredPromise<http.ClientRequest>()

  interceptor.on('request', ({ request, controller }) => {
    const rawRequest = getRawRequest(request)
    if (rawRequest instanceof http.ClientRequest) {
      rawRequestPromise.resolve(rawRequest)
    } else {
      console.error(rawRequest)
      rawRequestPromise.reject(
        new Error('Expected rawRequest to be an instance of http.ClientRequest')
      )
    }

    controller.respondWith(new Response())
  })

  http
    .request('http://localhost', {
      headers: {
        'X-CustoM-HeadeR-NamE': 'value',
      },
    })
    .end()

  const rawRequest = await rawRequestPromise
  expect(rawRequest).toBeInstanceOf(http.ClientRequest)
  expect(rawRequest.getRawHeaderNames()).toContain('X-CustoM-HeadeR-NamE')
})

it('returns a reference to a raw XMLHttpRequest instance', async () => {
  const rawRequestPromise = new DeferredPromise<XMLHttpRequest>()
  interceptor.on('request', ({ request, controller }) => {
    const rawRequest = getRawRequest(request)

    if (rawRequest instanceof XMLHttpRequest) {
      rawRequestPromise.resolve(rawRequest)
    } else {
      console.error(rawRequest)
      rawRequestPromise.reject(
        new Error('Expected rawRequest to be an instance of XMLHttpRequest')
      )
    }

    controller.respondWith(new Response('hello world'))
  })

  await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost:3000')
    request.withCredentials = true
    request.send()
  })

  const rawRequest = await rawRequestPromise
  expect(rawRequest).toBeInstanceOf(XMLHttpRequest)
  expect(rawRequest.withCredentials).toBe(true)
  expect(rawRequest.responseText).toBe('hello world')
})

it('returns a reference to a raw Request instance (fetch)', async () => {
  const rawRequestPromise = new DeferredPromise<Request>()
  interceptor.on('request', ({ request, controller }) => {
    const rawRequest = getRawRequest(request)

    if (rawRequest instanceof Request) {
      rawRequestPromise.resolve(rawRequest)
    } else {
      console.error(rawRequest)
      rawRequestPromise.reject(
        new Error('Expected rawRequest to be an instance of XMLHttpRequest')
      )
    }

    controller.respondWith(new Response('hello world'))
  })

  const request = new Request('http://localhost:3000')
  await fetch(request)

  const rawRequest = await rawRequestPromise
  expect(rawRequest).toEqual(request)
})

it('returns undefined for a non-Request input (fetch)', async () => {
  const rawRequestPromise = new DeferredPromise<undefined>()
  interceptor.on('request', ({ request, controller }) => {
    const rawRequest = getRawRequest(request)

    if (typeof rawRequest === 'undefined') {
      rawRequestPromise.resolve(rawRequest)
    } else {
      console.error(rawRequest)
      rawRequestPromise.reject(new Error('Expected rawRequest to be undefined'))
    }

    controller.respondWith(new Response('hello world'))
  })

  await fetch('http://localhost:3000')
  await expect(rawRequestPromise).resolves.toBeUndefined()
})
