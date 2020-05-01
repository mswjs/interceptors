/**
 * @jest-environment node
 */
import http from 'http'
import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import {
  assertIntercepted,
  assertHeaders,
  assertQueryParameter,
  createRequest,
} from '../../helpers'

describe('http.get', () => {
  let requestInterceptor: RequestInterceptor
  const pool: InterceptedRequest[] = []

  beforeAll(() => {
    requestInterceptor = new RequestInterceptor()
    requestInterceptor.use((req) => {
      pool.push(req)
    })
  })

  afterAll(() => {
    requestInterceptor.restore()
  })

  it('supports GET request', async () => {
    await assertIntercepted(
      pool,
      createRequest({
        using: http.get,
        url: 'http://httpbin.org/get',
      })
    )
  })

  it('supports GET request with headers', async () => {
    await assertHeaders(
      pool,
      createRequest({
        using: http.get,
        url: 'http://httpbin.org/get/headers',
        options: {
          headers: {
            'x-custom-header': 'true ',
          },
        },
      })
    )
  })

  it('supports GET request with query parameter', async () => {
    await assertQueryParameter(
      pool,
      createRequest({
        using: http.get,
        url: 'http://httpbin.org/get/query?userId=abc',
      }),
      {
        userId: 'abc',
      }
    )
  })
})
