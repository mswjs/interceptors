/**
 * @jest-environment jsdom
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

let httpServer: ServerApi

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  switch (request.url.pathname) {
    case '/user': {
      request.respondWith({
        status: 200,
      })
      break
    }

    case '/numbers-mock': {
      request.respondWith({
        status: 200,
        body: JSON.stringify([1, 2, 3]),
      })
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
  httpServer = await createServer((app) => {
    app.get('/', (_req, res) => {
      res.status(200).end()
    })
    app.get('/numbers', (_req, res) => {
      res.status(200).json([1, 2, 3])
    })
  })
})

afterEach(() => {
  interceptor.dispose()
})

afterAll(async () => {
  await httpServer.close()
})

test('emits correct events sequence for an unhandled request with no response body', async () => {
  interceptor.apply()
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl())
    spyOnEvents(req, listener)
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 4],
    /**
     * @note XMLHttpRequest polyfill from JSDOM dispatches the "readystatechange" listener.
     * XMLHttpRequest override also dispatches the "readystatechange" listener for the original
     * request explicitly to it never hangs. This results in the listener being called twice.
     */
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toEqual(4)
})

test('emits correct events sequence for a handled request with no response body', async () => {
  interceptor.apply()
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/user'))
    spyOnEvents(req, listener)
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})

test('emits correct events sequence for an unhandled request with a response body', async () => {
  interceptor.apply()
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/numbers'))
    spyOnEvents(req, listener)
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
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
  interceptor.apply()
  const listener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/numbers-mock'))
    spyOnEvents(req, listener)
    req.send()
  })

  expect(listener.mock.calls).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})
