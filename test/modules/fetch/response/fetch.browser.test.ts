/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { HttpServer } from '@open-draft/test-server/http'
import { listToHeaders } from 'headers-polyfill'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

declare namespace window {
  export const interceptor: FetchInterceptor
  export let serializeHeaders: (headers: Headers) => Record<string, string>
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

interface SerializedResponse {
  url: Response['url']
  type: Response['type']
  status: Response['status']
  statusText: Response['statusText']
  headers: [string, string][]
  json?: Record<string, any>
}

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.status(200).json({ route: '/' }).end()
  })
  app.get('/get', (req, res) => {
    res.status(200).json({ route: '/get' }).end()
  })
})

async function prepareRuntime() {
  const context = await pageWith({
    example: path.resolve(__dirname, 'fetch.browser.runtime.js'),
  })

  await context.page.evaluate((httpUrl) => {
    window.serverHttpUrl = httpUrl
  }, httpServer.http.url('/'))

  await context.page.evaluate((httpsUrl) => {
    window.serverHttpsUrl = httpsUrl
  }, httpServer.https.url('/'))

  return context
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('responds to an HTTP request handled in the resolver', async () => {
  const context = await prepareRuntime()
  const response: SerializedResponse = await context.page.evaluate((url) => {
    return fetch(url).then((response) => {
      return response.json().then((json) => ({
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(
          // @ts-ignore
          response.headers.entries()
        ),
        json,
      }))
    })
  }, httpServer.http.url('/'))
  const headers = listToHeaders(response.headers)

  expect(response.url).toBe(httpServer.http.url('/'))
  expect(response.type).toBe('default')
  expect(response.status).toBe(201)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/hal+json')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
  expect(response.json).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTP request not handled in the resolver', async () => {
  const context = await prepareRuntime()
  const response: SerializedResponse = await context.page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(
          // @ts-ignore
          response.headers.entries()
        ),
      }
    })
  }, httpServer.http.url('/get'))
  const headers = listToHeaders(response.headers)

  expect(response.url).toBe(httpServer.http.url('/get'))
  expect(response.type).toBe('cors')
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
})

test('responds to an HTTPS request handled in the resolver', async () => {
  const context = await prepareRuntime()
  const response: SerializedResponse = await context.page.evaluate((url) => {
    /**
     * @todo give a custom Agent to allow HTTPS on insecure hosts.
     */
    return fetch(url).then((response) => {
      return response.json().then((json) => ({
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(
          // @ts-ignore
          response.headers.entries()
        ),
        json,
      }))
    })
  }, httpServer.https.url('/'))
  const headers = listToHeaders(response.headers)

  expect(response.url).toBe(httpServer.https.url('/'))
  expect(response.type).toBe('default')
  expect(response.status).toBe(201)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/hal+json')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
  expect(response.json).toEqual({
    mocked: true,
  })
})

test('bypasses an HTTPS request not handled in the resolver', async () => {
  const context = await prepareRuntime()
  const response: SerializedResponse = await context.page.evaluate((url) => {
    return fetch(url).then((response) => {
      return {
        url: response.url,
        type: response.type,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(
          // @ts-ignore
          response.headers.entries()
        ),
      }
    })
  }, httpServer.https.url('/get'))
  const headers = listToHeaders(response.headers)

  expect(response.url).toBe(httpServer.https.url('/get'))
  expect(response.type).toBe('cors')
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(headers).not.toHaveProperty('map')
  expect(headers.has('map')).toBe(false)
})

test('bypasses any request when the interceptor is restored', async () => {
  const context = await prepareRuntime()

  await context.page.evaluate(() => {
    window.interceptor.dispose()
  })

  const httpResponse: SerializedResponse = await context.page.evaluate(
    (url) => {
      return fetch(url).then((response) => {
        return {
          url: response.url,
          type: response.type,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(
            // @ts-ignore
            response.headers.entries()
          ),
        }
      })
    },
    httpServer.http.url('/')
  )

  expect(httpResponse.url).toBe(httpServer.http.url('/'))
  expect(httpResponse.type).toBe('cors')
  expect(httpResponse.status).toBe(200)

  const httpsResponse: SerializedResponse = await context.page.evaluate(
    (url) => {
      return fetch(url).then((response) => {
        return {
          url: response.url,
          type: response.type,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(
            // @ts-ignore
            response.headers.entries()
          ),
        }
      })
    },
    httpServer.https.url('/get')
  )

  expect(httpsResponse.url).toBe(httpServer.https.url('/get'))
  expect(httpsResponse.type).toBe('cors')
  expect(httpsResponse.status).toBe(200)
})
