import http from 'http'

import { beforeAll, afterAll, it, expect } from 'vitest'
import { SocketInterceptor } from '../../../src/interceptors/Socket'
import { waitForClientRequest } from '../../helpers'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a socket', async () => {
  const request = http.get('http://example.com/resource', {
    headers: {
      'X-Custom-Header': 'yes',
    },
  })
  const { res } = await waitForClientRequest(request)
  console.log(res.statusCode, res.statusMessage)
})
