/**
 * @note https://xhr.spec.whatwg.org/#event-handlers
 */
// @vitest-environment jsdom
import { createTestHttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('dispatches correct events on a successful passthrough response', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/', () => new Response('hello'))
    }
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url())
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(200)
  expect(request.responseText).toBe('hello')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
})

it('dispatches correct events on a successful mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello'))
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(200)
  expect(request.responseText).toBe('hello')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
})

it('dispatches correct events on a passthrough error response', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/', () => new Response('Server error', { status: 500 }))
    }
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url())
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.responseText).toBe('Server error')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
})

it('dispatches correct events on a mocked error response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('Server error', { status: 500 }))
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.responseText).toBe('Server error')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1],
    ['loadstart', 1],
    ['readystatechange', 2],
    ['readystatechange', 3],
    ['progress', 3],
    ['readystatechange', 4],
    ['load', 4],
    ['loadend', 4]
  ])
})

it('dispatches correct events on a passthrough request error', async () => {
  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost/non-existing-resource')
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(0)
  expect(request.responseText).toBe('')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1 ],
    ['loadstart', 1 ],
    ['readystatechange', 4 ],
    ['error', 4 ],
    ['loadend', 4 ]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1 ],
    ['loadstart', 1 ],
    ['readystatechange', 4 ],
    ['error', 4 ],
    ['loadend', 4 ]
  ])
})

it('dispatches correct events on a mocked request error', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost/non-existing-resource')
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(0)
  expect(request.responseText).toBe('')

  expect(eventHandlers.mock.calls).toEqual([
    ['readystatechange', 1 ],
    ['loadstart', 1 ],
    ['readystatechange', 4 ],
    ['error', 4 ],
    ['loadend', 4 ]
  ])
  expect(eventListeners.mock.calls).toEqual([
    ['readystatechange', 1 ],
    ['loadstart', 1 ],
    ['readystatechange', 4 ],
    ['error', 4 ],
    ['loadend', 4 ]
  ])
})

it('dispatches correct event on an unhandled exception in the interceptor', async () => {
  interceptor.on('request', () => {
    throw new Error('Runtime error')
  })

  const [request, { eventHandlers, eventListeners }] = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost/non-existing-resource')
    request.send()
  }, { spyOnEvents: true })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Runtime error',
    stack: expect.any(String),
  })
})
