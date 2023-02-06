/**
 * @jest-environment jsdom
 * @see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest#instance_methods
 */
import { HttpServer } from '@open-draft/test-server/http'
import { Response } from '@remix-run/web-fetch'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).end()
  })
  app.get('/numbers', (_req, res) => {
    res.status(200).json([1, 2, 3])
  })
})

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/user': {
      request.respondWith(new Response())
      break
    }

    case '/numbers-mock': {
      request.respondWith(new Response(JSON.stringify([1, 2, 3])))
      break
    }
  }
})

function spyOnEvents(req: XMLHttpRequest, listener: jest.Mock) {
  function wrapListener(this: XMLHttpRequest, event: Event) {
    listener(event.type, this.readyState)
  }

  req.addEventListener('readystatechange', wrapListener)
  req.addEventListener('loadstart', wrapListener)
  req.addEventListener('progress', wrapListener)
  req.addEventListener('timeout', wrapListener)
  req.addEventListener('load', wrapListener)
  req.addEventListener('loadend', wrapListener)
  req.addEventListener('abort', wrapListener)
  req.addEventListener('error', wrapListener)
}

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('emits correct events sequence for an unhandled request with no response body', async () => {
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    spyOnEvents(req, listener)
    req.open('GET', httpServer.http.url())
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['readystatechange', 1], // OPEN
    ['loadstart', 1],
    ['readystatechange', 2], // HEADERS_RECEIVED
    ['readystatechange', 4], // DONE
    /**
     * @note XMLHttpRequest polyfill from JSDOM dispatches the "readystatechange" listener.
     * XMLHttpRequest override also dispatches the "readystatechange" listener for the original
     * request explicitly so it never hangs. This results in the listener being called twice.
     */
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toEqual(4)
})

test('emits correct events sequence for a handled request with no response body', async () => {
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    spyOnEvents(req, listener)
    req.open('GET', httpServer.http.url('/user'))
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['readystatechange', 1], // OPEN
    ['loadstart', 1],
    ['readystatechange', 2], // HEADERS_RECEIVED
    ['readystatechange', 3], // LOADING
    ['readystatechange', 4], // DONE
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})

test('emits correct events sequence for an unhandled request with a response body', async () => {
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    spyOnEvents(req, listener)
    req.open('GET', httpServer.http.url('/numbers'))
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['readystatechange', 1], // OPEN
    ['loadstart', 1],
    ['readystatechange', 2], // HEADERS_RECEIVED
    ['readystatechange', 3], // LOADING
    ['progress', 3],
    ['readystatechange', 4],
    /**
     * @note The same issue with the "readystatechange" callback being called twice.
     */
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})

test('emits correct events sequence for a handled request with a response body', async () => {
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    spyOnEvents(req, listener)
    req.open('GET', httpServer.http.url('/numbers-mock'))
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['readystatechange', 1], // OPEN
    ['loadstart', 1],
    ['readystatechange', 2], // HEADERS_RECEIVED
    ['readystatechange', 3], // LOADING
    ['progress', 3],
    ['readystatechange', 4], // DONE
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})
