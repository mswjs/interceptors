import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('returns an empty string for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('about:')
  expect(response.url).toBe('')
})

it('returns the request url for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/does-not-matter')
  expect(response.url).toBe('http://localhost/does-not-matter')
})

it('returns an empty string for a cloned mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('about:')
  expect(response.clone().url).toBe('')
})

it('returns the request url for a cloned mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/does-not-matter')
  expect(response.clone().url).toBe('http://localhost/does-not-matter')
})

it('returns the request url for a bypassed response', async () => {
  const requestUrl = httpServer.http.url('/resource')
  const response = await fetch(requestUrl)
  expect(response.url).toBe(requestUrl)
})

it('returns the last response url in case of redirects', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/target')) {
      controller.respondWith(
        new Response(null, {
          status: 302,
          headers: {
            location: 'http://localhost/destination',
          },
        })
      )
      return
    }

    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/target')
  expect(response.url).toBe('http://localhost/destination')
  await expect(response.text()).resolves.toBe('hello world')
})

it('resolves relative URLs against location', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('Hello world'))
  })

  const originalLocation = global.location
  Object.defineProperty(global, 'location', {
    value: new URL('http://localhost/path/'),
    configurable: true,
  })

  const response = await fetch('?x=y')
  expect(response.url).toBe('http://localhost/path/?x=y')
  Object.defineProperty(global, 'location', {
    value: originalLocation,
    configurable: true,
  })
})
