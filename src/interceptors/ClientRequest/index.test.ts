import * as http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { ClientRequestInterceptor } from '.'
import { toWebResponse } from '../../../test/helpers'

let httpServer: TestHttpServer

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      // The test server always defines a root ("/") route.
      router.get('/get', () => {
        return new Response('/get')
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

it('abort the request if the abort signal is emitted', async () => {
  const requestUrl = httpServer.http.url('/').href

  interceptor.on('request', async function delayedResponse({ controller }) {
    await setTimeout(1000)
    controller.respondWith(new Response())
  })

  const abortController = new AbortController()
  const request = http.get(requestUrl, { signal: abortController.signal })

  abortController.abort()

  const abortErrorPromise = Promise.withResolvers<Error>()
  request.on('error', function (error) {
    abortErrorPromise.resolve(error)
  })

  const abortError = await abortErrorPromise.promise
  expect(abortError.name).toBe('AbortError')

  expect(request.destroyed).toBe(true)
})
