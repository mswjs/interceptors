import { it, expect, beforeAll, afterAll } from 'vitest'
import { httpGet } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports requests with IPv6 request url', async () => {
  interceptor.apply();
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('test'))
  });

  const { resBody } = await httpGet('http://[2607:f0d0:1002:51::4]:8080/')
  expect(resBody).toBe('test')
})