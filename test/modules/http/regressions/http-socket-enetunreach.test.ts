import { it, expect } from 'vitest'
import { httpGet } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

it('does not leave the test process hanging due to the custom socket timeout', async () => {
  const interceptor = new ClientRequestInterceptor()
  interceptor.apply();
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('test'))
  });

  const { resBody } = await httpGet('http://[2607:f0d0:1002:51::4]:8080/')
  expect(resBody).toBe('test')
})