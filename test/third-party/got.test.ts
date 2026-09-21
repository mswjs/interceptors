// @vitest-environment node
import { setTimeout } from 'node:timers/promises'
import got from 'got'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { compressResponse } from '#/test/helpers'

let httpServer: TestHttpServer

/**
 * A body large enough to be delivered in multiple chunks.
 */
const largeJsonBody = JSON.stringify(
  Object.fromEntries(
    Array.from({ length: 5_000 }, (_, index) => {
      return [`field${index}`, `value${index}`]
    })
  )
)

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/user', () => {
        return Response.json({ id: 1 })
      })
      router.get('/compressed', () => {
        const compressedBody = compressResponse(['gzip'], largeJsonBody)

        return new Response(compressedBody, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-encoding': 'gzip',
            'content-length': String(compressedBody.byteLength),
          },
        })
      })
    },
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('mocks response to a request made with "got"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const response = await got(httpServer.http.url('/test').href)

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe('mocked-body')
})

it('bypasses an unhandled request made with "got"', async () => {
  const response = await got(httpServer.http.url('/user').href)

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe(`{"id":1}`)
})

/**
 * @see https://github.com/mswjs/msw/issues/1468
 * @see https://github.com/mswjs/msw/issues/2200
 */
it('bypasses an unhandled request with a compressed response made with "got"', async () => {
  const response = await got(httpServer.http.url('/compressed').href)

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe(largeJsonBody)
})

it('supports timeout before resolving request as-is', async () => {
  interceptor.on('request', async ({ controller }) => {
    await setTimeout(750)
    controller.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const response = await got('https://intentionally-non-existing-host.com')
  const requestEnd = Date.now()

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.body).toBe('mocked response')
  expect.soft(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})

it('supports responding with a 204 mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 204,
        headers: {
          'content-type': 'application/dicom+json',
        },
      })
    )
  })

  const client = got.extend({
    prefixUrl: 'http://localhost:3000/path',
    headers: {
      authorization: 'Bearer fake-token',
      accept: 'application/dicom+json',
    },
    responseType: 'json',
    retry: { limit: 0 },
  })

  const response = await client.get('studies')
  expect.soft(response.statusCode).toBe(204)
  expect
    .soft(response.headers)
    .toHaveProperty('content-type', 'application/dicom+json')
  expect.soft(response.body).toBe('')
})
