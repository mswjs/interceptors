// @vitest-environment node
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { toWebResponse } from '#/test/helpers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports requests with IPv6 request url', async () => {
  const url = 'http://[2607:f0d0:1002:51::4]:8080/'
  const listenerUrlPromise = new DeferredPromise<string>()

  interceptor.on('request', ({ request, controller }) => {
    listenerUrlPromise.resolve(request.url)
    controller.respondWith(new Response('test'))
  })

  const request = http.get(url)
  const [response] = await toWebResponse(request)

  const requestUrl = await listenerUrlPromise
  expect.soft(requestUrl).toBe(url)
  await expect.soft(response.text()).resolves.toBe('test')
})
