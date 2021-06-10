/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { createServer, ServerApi } from '@open-draft/test-server'
import { listToHeaders } from 'headers-utils/lib'
import { InterceptorApi } from '../../src'

declare namespace window {
  export const interceptor: InterceptorApi
  export let serializeHeaders: (headers: Headers) => Record<string, string>
  export let serverHttpUrl: string
  export let serverHttpsUrl: string
}

interface SerializedResponse {
  type: Response['type']
  status: Response['status']
  statusText: Response['statusText']
  headers: [string, string][]
  json?: Record<string, any>
}

let server: ServerApi

async function prepareRuntime() {
  const context = await pageWith({
    example: path.resolve(__dirname, 'fetch.browser.runtime.js'),
  })

  await context.page.evaluate((httpUrl) => {
    window.serverHttpUrl = httpUrl
  }, server.http.makeUrl('/'))

  await context.page.evaluate((httpsUrl) => {
    window.serverHttpsUrl = httpsUrl
  }, server.https.makeUrl('/'))

  return context
}

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).json({ route: '/' }).end()
    })
    app.get('/get', (req, res) => {
      res.status(200).json({ route: '/get' }).end()
    })
  })
})

afterAll(async () => {
  await server.close()
})

describe('HTTP', () => {
  test('responds to an HTTP request handled in the resolver', async () => {
    const context = await prepareRuntime()
    const response: SerializedResponse = await context.page.evaluate((url) => {
      return fetch(url).then((response) => {
        return response.json().then((json) => ({
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
    }, server.http.makeUrl('/'))
    const headers = listToHeaders(response.headers)

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
          type: response.type,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(
            // @ts-ignore
            response.headers.entries()
          ),
        }
      })
    }, server.http.makeUrl('/get'))
    const headers = listToHeaders(response.headers)

    expect(response.type).toBe('cors')
    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(headers).not.toHaveProperty('map')
    expect(headers.has('map')).toBe(false)
  })
})

describe('HTTPS', () => {
  test('responds to an HTTPS request handled in the resolver', async () => {
    const context = await prepareRuntime()
    const response: SerializedResponse = await context.page.evaluate((url) => {
      /**
       * @todo give a custom Agent to allow HTTPS on insecure hosts.
       */
      return fetch(url).then((response) => {
        return response.json().then((json) => ({
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
    }, server.https.makeUrl('/'))
    const headers = listToHeaders(response.headers)

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
          type: response.type,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(
            // @ts-ignore
            response.headers.entries()
          ),
        }
      })
    }, server.https.makeUrl('/get'))
    const headers = listToHeaders(response.headers)

    expect(response.type).toBe('cors')
    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(headers).not.toHaveProperty('map')
    expect(headers.has('map')).toBe(false)
  })
})

test('bypasses any request when the interceptor is restored', async () => {
  const context = await prepareRuntime()

  await context.page.evaluate(() => {
    window.interceptor.restore()
  })

  const httpResponse: SerializedResponse = await context.page.evaluate(
    (url) => {
      return fetch(url).then((response) => {
        return {
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
    server.http.makeUrl('/')
  )

  expect(httpResponse.type).toBe('cors')
  expect(httpResponse.status).toBe(200)

  const httpsResponse: SerializedResponse = await context.page.evaluate(
    (url) => {
      return fetch(url).then((response) => {
        return {
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
    server.http.makeUrl('/get')
  )

  expect(httpsResponse.type).toBe('cors')
  expect(httpsResponse.status).toBe(200)
})
