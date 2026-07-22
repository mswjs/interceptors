// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2307
 */
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import type { HttpBindings } from '@hono/node-server'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { FetchResponse } from '#/src/utils/fetch-utils'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', (ctx) => {
        /**
         * @note Respond via the raw Node.js response: the Fetch API
         * `Response` cannot describe a 101 informational response.
         */
        const { outgoing } = ctx.env as HttpBindings
        outgoing.writeHead(101, 'Switching Protocols')
        outgoing.end()
        return RESPONSE_ALREADY_SENT
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

it('handles non-configurable responses from the actual server', async () => {
  const responsePromise = Promise.withResolvers<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })

  const request = http.get(httpServer.http.url('/resource').href)
  const [response] = await toWebResponse(request)

  // Must passthrough non-configurable responses
  // (i.e. those that cannot be created using the Fetch API).
  expect(response.status).toBe(101)
  expect(response.statusText).toBe('Switching Protocols')

  // Must expose the exact response in the listener.
  await expect(responsePromise.promise).resolves.toHaveProperty('status', 101)
})

it('supports mocking non-configurable responses', async () => {
  interceptor.on('request', ({ controller }) => {
    /**
     * @note The Fetch API `Response` will still error on
     * non-configurable status codes. Instead, use this helper class.
     */
    controller.respondWith(new FetchResponse(null, { status: 101 }))
  })

  const responsePromise = Promise.withResolvers<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })

  const request = http.get('http://localhost/irrelevant')
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(101)

  // Must expose the exact response in the listener.
  await expect(responsePromise.promise).resolves.toHaveProperty('status', 101)
})
