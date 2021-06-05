/**
 * @jest-environment jsdom
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../helpers'

type EventPool = [string, number][]

let server: ServerApi
const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    switch (request.url.pathname) {
      case '/user': {
        return {
          status: 200,
        }
      }

      case '/numbers-mock': {
        return {
          status: 200,
          body: JSON.stringify([1, 2, 3]),
        }
      }
    }
  },
})

function spyOnEvents(request: XMLHttpRequest, pool: EventPool) {
  function listener(this: XMLHttpRequest, event: Event) {
    pool.push([event.type, this.readyState])
  }
  request.addEventListener('readystatechange', listener)
  request.addEventListener('loadstart', listener)
  request.addEventListener('progress', listener)
  request.addEventListener('timeout', listener)
  request.addEventListener('load', listener)
  request.addEventListener('loadend', listener)
  request.addEventListener('abort', listener)
  request.addEventListener('error', listener)
}

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).end()
    })
    app.get('/numbers', (req, res) => {
      res.status(200).json([1, 2, 3])
    })
  })
})

afterEach(() => {
  interceptor.restore()
})

afterAll(async () => {
  await server.close()
})

test('emits correct events sequence for an unhandled request with no response body', async () => {
  interceptor.apply()
  const mockEvents: EventPool = []
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.makeUrl())
    spyOnEvents(request, mockEvents)
  })

  expect(mockEvents).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 4],
    /**
     * @note XMLHttpRequest polyfill from JSDOM dispatches the `readystatechange` listener.
     * XMLHttpRequest override also dispatches the `readystatechange` listener for the original
     * request explicitly to it never hangs. This results in the listener being called twice.
     */
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(request.readyState).toBe(4)
})

test('emits correct events sequence for a handled request with no response body', async () => {
  interceptor.apply()
  const mockEvents: EventPool = []
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.makeUrl('/user'))
    spyOnEvents(request, mockEvents)
  })

  expect(mockEvents).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(request.readyState).toBe(4)
})

test('emits correct events sequence for an unhandled request with a response body', async () => {
  interceptor.apply()
  const mockEvents: EventPool = []
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.makeUrl('/numbers'))
    spyOnEvents(request, mockEvents)
  })

  expect(mockEvents).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    /**
     * @note The same issue with the `readystatechange` callback being called twice.
     */
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(request.readyState).toBe(4)
})

test('emits correct events sequence for a handled request with a response body', async () => {
  interceptor.apply()
  const mockEvents: EventPool = []
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.makeUrl('/numbers-mock'))
    spyOnEvents(request, mockEvents)
  })

  expect(mockEvents).toEqual([
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4],
  ])
  expect(request.readyState).toBe(4)
})
