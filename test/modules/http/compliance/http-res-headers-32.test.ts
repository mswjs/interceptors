// @vitest-environment node
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'
import { HttpServer } from '@open-draft/test-server/lib/http'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.disable('x-powered-by')
  app.get('/', (req, res) => {
    const headers: Record<string, string> = {}
    for (let i = 1; i <= 32; i++) {
      headers[`x-header-${i}`] = `value${i}`
    }
    res.set(headers)
    res.end()
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

it('support more than 32 headers', async () => {
  const requestUrl = httpServer.http.url('/')
  const request = http.get(requestUrl)

  const { res } = await waitForClientRequest(request)
  expect(Object.keys(res.headers).length).toBe(35) // 32 custom headers + 3 default headers
})

it('support more than 32 headers', async () => {
  const requestUrl = httpServer.http.url('/')
  const responsePromise = new DeferredPromise<Response>()
  interceptor.on('response', ({ response }) => {
    responsePromise.resolve(response)
  })
  http.get(requestUrl)

  const response = await responsePromise
  expect(Object.keys(Object.fromEntries(response.headers.entries())).length).toBe(35) // 32 custom headers + 3 default headers
})