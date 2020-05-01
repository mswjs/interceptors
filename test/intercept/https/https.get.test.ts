/**
 * @jest-environment node
 */
import https from 'https'
import { RequestInterceptor } from '../../../src'
import { InterceptedRequest } from '../../../src/glossary'
import {
  assertIntercepted,
  assertHeaders,
  assertQueryParameter,
  createRequest,
} from '../../helpers'

describe('https.get', () => {
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
        using: https.get,
        url: 'https://httpbin.org/get',
      })
    )
  })

  it('supports GET request with headers', async () => {
    await assertHeaders(
      pool,
      createRequest({
        using: https.get,
        url: 'https://httpbin.org/get/headers',
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
        using: https.get,
        url: 'https://httpbin.org/get/query?userId=abc',
      }),
      {
        userId: 'abc',
      }
    )
  })
})
