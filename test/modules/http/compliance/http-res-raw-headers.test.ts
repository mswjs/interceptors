/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { _ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index-new'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new _ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('preserves the original mocked response headers casing in "rawHeaders"', async () => {
  interceptor.once('request', ({ request }) => {
    request.respondWith(
      new Response(null, {
        headers: {
          'X-CustoM-HeadeR': 'Yes',
        },
      })
    )
  })

  const request = http.get('http://any.thing')
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toStrictEqual(['X-CustoM-HeadeR', 'Yes'])
  expect(res.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})
