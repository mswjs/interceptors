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

it('does not fail when unsetting event handlers for a successful passthrough response', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/', () => new Response('hello'))
    }
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/'))
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(200)
  expect(request.responseText).toBe('hello')
})


it('does not fail when unsetting event handlers for a successful mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello'))
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(200)
  expect(request.responseText).toBe('hello')
})

it("does not fail when unsetting event handlers for a passthrough error response", async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/', () => new Response('Server error', { status: 500 }))
    }
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/'))
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.responseText).toBe('Server error')
})

it("does not fail when unsetting event handlers for a mocked error response", async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('Server error', { status: 500 }))
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.responseText).toBe('Server error')
})

it('does not fail when unsetting event handlers for a passthrough request error', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost/non-existing-resource')
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(0)
  expect(request.responseText).toBe('')
})

it('does not fail when unsetting event handlers for a mocked request error', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost')
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(0)
  expect(request.responseText).toBe('')
})

it('does not fail when unsetting event handlers during unhandled exception in the interceptor', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })

  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost')
    request.onreadystatechange = null
    request.onloadstart = null
    request.onprogress = null
    request.onload = null
    request.onloadend = null
    request.ontimeout = null
    request.send()
  })

  expect(request.readyState).toBe(4)
  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})
