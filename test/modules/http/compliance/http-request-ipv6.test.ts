import { it, expect, beforeAll, afterAll } from 'vitest'
import { httpGet } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new ClientRequestInterceptor()

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

  const { resBody } = await httpGet(url)
  const requestUrl = await listenerUrlPromise
  expect(resBody).toBe('test')
  expect(requestUrl).toBe(url)
})
