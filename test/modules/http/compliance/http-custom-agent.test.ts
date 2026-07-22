// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('hello world')
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

it('preserves the context of the "createConnection" function in a custom http agent', async () => {
  const createConnectionContextSpy = vi.fn()
  class CustomHttpAgent extends http.Agent {
    createConnection(options: any, callback: any) {
      createConnectionContextSpy(this)
      return super.createConnection(options, callback)
    }
  }
  const agent = new CustomHttpAgent()

  const request = http.get(httpServer.http.url('/resource').href, { agent })
  await toWebResponse(request)

  const [context] = createConnectionContextSpy.mock.calls[0] || []
  expect(context.constructor.name).toBe('CustomHttpAgent')
})

it('preserves the context of the "createConnection" function in a custom https agent', async () => {
  const createConnectionContextSpy = vi.fn()
  class CustomHttpsAgent extends https.Agent {
    createConnection(options: any, callback: any) {
      createConnectionContextSpy(this)
      return super.createConnection(options, callback)
    }
  }
  const agent = new CustomHttpsAgent()

  const request = https.get(httpServer.https.url('/resource').href, {
    agent,
    rejectUnauthorized: false,
  })
  await toWebResponse(request)

  const [context] = createConnectionContextSpy.mock.calls[0]
  expect(context.constructor.name).toBe('CustomHttpsAgent')
})
