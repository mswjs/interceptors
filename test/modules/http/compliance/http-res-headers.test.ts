import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

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

it.only('folds duplicate headers the same as Node', async () => {
  const replyHeaders = [
    'Content-Type',
    'text/html; charset=utf-8',
    'set-cookie',
    'set-cookie1=foo',
    'set-cookie',
    'set-cookie2=bar',
    'set-cookie',
    'set-cookie3=baz',
    'cookie',
    'cookie1=foo; cookie2=bar',
    'cookie',
    'cookie3=baz',
    'x-custom',
    'custom1',
    'X-Custom',
    'custom2',
    'X-Custom',
    'custom3',
  ]
  interceptor.once('request', ({ request }) => {
    const response = new Response(null)
    for (let i = 0; i < replyHeaders.length; i += 2) {
      response.headers.append(replyHeaders[i], replyHeaders[i + 1])
    }
    request.respondWith(response)
  })

  const request = http.get('http://any.thing')
  const { res } = await waitForClientRequest(request)

  expect(res.headers).to.deep.equal({
    'content-type': 'text/html; charset=utf-8',
    'set-cookie': ['set-cookie1=foo', 'set-cookie2=bar', 'set-cookie3=baz'],
    cookie: 'cookie1=foo; cookie2=bar; cookie3=baz',
    'x-custom': 'custom1, custom2, custom3',
  })
  expect(res.rawHeaders).to.deep.equal(replyHeaders)
})

