// @vitest-environment node
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('preserves the original mocked response headers casing in "rawHeaders"', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: {
          'X-CustoM-HeadeR': 'Yes',
        },
      })
    )
  })

  const request = http.get('http://localhost/resource')
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toStrictEqual(['X-CustoM-HeadeR', 'Yes'])
  expect(res.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})

it('folds duplicate response headers for a mocked response', async () => {
  const responseHeaders = [
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

  interceptor.once('request', ({ controller }) => {
    const response = new Response(null)
    for (let i = 0; i < responseHeaders.length; i += 2) {
      response.headers.append(responseHeaders[i], responseHeaders[i + 1])
    }
    controller.respondWith(response)
  })

  const request = http.get('http://localhost/resource')
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(responseHeaders)
})
