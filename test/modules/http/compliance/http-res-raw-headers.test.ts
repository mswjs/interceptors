/**
 * @vitest-environment node
 */
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import type { HttpBindings } from '@hono/node-server'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

// The actual server is here for A/B purpose only.
let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()

  const RequestBeforeServer = globalThis.Request
  const ResponseBeforeServer = globalThis.Response

  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', (ctx) => {
        /**
         * @note Respond via the raw Node.js response: the Fetch API
         * `Headers` normalize header names to lowercase, and this test
         * asserts the raw (cased) header names from the actual server.
         */
        const { outgoing } = ctx.env as HttpBindings
        outgoing.writeHead(200, { 'X-CustoM-HeadeR': 'Yes' })
        outgoing.end()
        return RESPONSE_ALREADY_SENT
      })
    },
  })

  /**
   * @note "@hono/node-server" overrides the global "Request" and "Response"
   * classes with its own lightweight implementations when the server starts.
   * Restore the original classes since these tests rely on the raw headers
   * handling of the patched globals.
   */
  globalThis.Request = RequestBeforeServer
  globalThis.Response = ResponseBeforeServer
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('preserves raw response headers (object init)', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: {
          'X-CustoM-HeadeR': 'Yes',
        },
      })
    )
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
  })
})

it('preserves raw response headers (array init)', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: [['X-CustoM-HeadeR', 'Yes']],
      })
    )
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
  })
})

it('preserves raw response headers (set after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: { 'X-CustoM-HeadeR': 'Yes' },
    })
    response.headers.set('x-My-Header', '1')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes', 'x-My-Header', '1'])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
    'x-my-header': '1',
  })
})

it('preserves raw response headers (append after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: { 'X-CustoM-HeadeR': 'Yes' },
    })
    response.headers.append('x-my-header', '1')
    response.headers.append('x-My-Header', '2')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining([
      'X-CustoM-HeadeR',
      'Yes',
      'x-my-header',
      '1',
      'x-My-Header',
      '2',
    ])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
    'x-my-header': '1, 2',
  })
})

it('preserves raw response headers (delete after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: {
        'X-CustoM-HeadeR': 'Yes',
        'x-My-Header': '1',
        'x-my-header': '2',
      },
    })
    response.headers.delete('x-my-header')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
  })
})

it('preserves raw response headers (standalone Headers)', async () => {
  interceptor.on('request', ({ controller }) => {
    const headers = new Headers({
      'X-CustoM-HeadeR': 'Yes',
    })
    controller.respondWith(new Response(null, { headers }))
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(Object.fromEntries(response.headers)).toStrictEqual({
    'x-custom-header': 'Yes',
  })
})

it('preserves raw response headers for unmocked request', async () => {
  const request = http.get(httpServer.http.url('/resource').href)
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(response.headers.get('x-custom-header')).toBe('Yes')
})
