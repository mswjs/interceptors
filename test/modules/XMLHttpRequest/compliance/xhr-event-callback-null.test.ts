/**
 * @note https://xhr.spec.whatwg.org/#event-handlers
 */
// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('hello')
  })
  app.get('/error', (req, res) => {
    res.status(500).send('Internal Server Error')
  })
  app.get('/exception', (req, res) => {
    throw new Error('Server error')
  })
})

beforeAll(async () => {
  interceptor.apply()
  interceptor.on('request', ({ request }) => {
    switch (true) {
      case request.url.endsWith('/exception'): {
        throw new Error('Network error')
      }

      case request.url.endsWith('/error'): {
        return request.respondWith(
          new Response('Internal Server Error', { status: 500 })
        )
      }

      default:
        return request.respondWith(new Response('hello'))
    }
  })

  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/resource')],
  ['mocked', () => 'http://localhost/resource'],
])(
  `does not fail when unsetting event handlers for a successful %s response`,
  async (_, getUrl) => {
    const url = getUrl()

    const request = await createXMLHttpRequest((request) => {
      request.open('GET', url)

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
  }
)

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/error')],
  ['mocked', () => 'http://localhost/error'],
])(
  `does not fail when unsetting event handlers for a %s error response`,
  async (_, getUrl) => {
    const url = getUrl()

    const request = await createXMLHttpRequest((request) => {
      request.open('GET', url)

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
    expect(request.responseText).toBe('Internal Server Error')
  }
)

it.each<[name: string, getUrl: () => string]>([
  ['passthrough', () => httpServer.https.url('/exception')],
  ['mocked', () => 'http://localhost/exception'],
])(
  `does not fail when unsetting event handlers for a %s request error`,
  async (_, getUrl) => {
    const url = getUrl()

    const request = await createXMLHttpRequest((request) => {
      request.open('GET', url)

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
  }
)
