// @vitest-environment node
import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/get', () => {
        return new Response('original')
      })
    },
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.restoreAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('calls a custom callback once when the request is bypassed', async () => {
  const responseCallback = vi.fn()

  const request = https.get(
    httpServer.https.url('/get').href,
    {
      rejectUnauthorized: false,
    },
    responseCallback
  )

  const [response] = await toWebResponse(request)

  await expect.soft(response.text()).resolves.toBe('original')
  expect.soft(responseCallback).toHaveBeenCalledOnce()
})

it('calls a custom callback once when the response is mocked', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mocked', {
        status: 403,
        statusText: 'Forbidden',
      })
    )
  })

  const responseCallback = vi.fn()

  const request = https.get(
    httpServer.https.url('/arbitrary').href,
    {
      rejectUnauthorized: false,
    },
    responseCallback
  )

  const [response] = await toWebResponse(request)

  await expect.soft(response.text()).resolves.toBe('mocked')
  expect.soft(response.status).toBe(403)
  expect.soft(response.statusText).toBe('Forbidden')
  expect.soft(responseCallback).toHaveBeenCalledOnce()
})
