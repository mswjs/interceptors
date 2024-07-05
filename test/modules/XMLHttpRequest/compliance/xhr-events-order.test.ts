// @vitest-environment jsdom
/**
 * @see https://xhr.spec.whatwg.org/#events
 */
import { Mock, vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (_req, res) => {
    res.status(200).end()
  })
  app.get('/numbers', (_req, res) => {
    res.status(200).json([1, 2, 3])
  })
})

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/user': {
      controller.respondWith(new Response())
      break
    }

    case '/numbers-mock': {
      controller.respondWith(new Response(JSON.stringify([1, 2, 3])))
      break
    }
  }
})

function spyOnEvents(req: XMLHttpRequest, listener: Mock) {
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

it('emits correct events sequence for an unhandled request with no response body', async () => {
  const listener = vi.fn()
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

    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toEqual(4)
})

it('emits correct events sequence for a handled request with no response body', async () => {
  const listener = vi.fn()
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

it('emits correct events sequence for an unhandled request with a response body', async () => {
  const listener = vi.fn()
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
    ['load', 4],
    ['loadend', 4],
  ])
  expect(req.readyState).toBe(4)
})

it('emits correct events sequence for a handled request with a response body', async () => {
  const listener = vi.fn()
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
