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
  assertBody,
} from '../../helpers'

describe('https.request', () => {
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

  /**
   * GET
   */
  describe('GET', () => {
    it('supports GET request', async () => {
      await assertIntercepted(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/get',
        })
      )
    })

    it('supports GET request with headers', async () => {
      await assertHeaders(
        pool,
        createRequest({
          using: https.request,
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
          using: https.request,
          url: 'https://httpbin.org/get/query?userId=abc',
        }),
        {
          userId: 'abc',
        }
      )
    })
  })

  /**
   * POST
   */
  describe('POST', () => {
    it('supports POST request', async () => {
      await assertIntercepted(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/post',
          options: {
            method: 'POST',
          },
        })
      )
    })

    it('supports POST request with headers', async () => {
      await assertHeaders(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/post/headers',
          options: {
            method: 'POST',
            headers: {
              'x-custom-header': 'true',
            },
          },
        })
      )
    })

    it('supports POST request with query parameter', async () => {
      await assertQueryParameter(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/post/query?userId=abc',
          options: {
            method: 'POST',
          },
        }),
        {
          userId: 'abc',
        }
      )
    })

    it('supports POST request with body', async () => {
      const request = createRequest({
        using: https.request,
        url: 'https://httpbin.org/post/body',
        options: {
          method: 'POST',
        },
      })

      request.ref.write('text-body')

      await assertBody(pool, request, 'text-body')
    })
  })

  /**
   * PUT
   */
  describe('PUT', () => {
    it('supports PUT request', async () => {
      await assertIntercepted(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/put',
          options: {
            method: 'PUT',
          },
        })
      )
    })

    it('supports PUT request with headers', async () => {
      await assertHeaders(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/put/headers',
          options: {
            method: 'PUT',
            headers: {
              'x-custom-header': 'true',
            },
          },
        })
      )
    })

    it('supports PUT request with query parameter', async () => {
      await assertQueryParameter(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/put/query?userId=abc',
          options: {
            method: 'PUT',
          },
        }),
        {
          userId: 'abc',
        }
      )
    })
  })

  /**
   * PATCH
   */
  describe('PATCH', () => {
    it('supports PATCH request', async () => {
      await assertIntercepted(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/patch',
          options: {
            method: 'PATCH',
          },
        })
      )
    })

    it('supports PATCH request with headers', async () => {
      await assertHeaders(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/patch/headers',
          options: {
            method: 'PATCH',
            headers: {
              'x-custom-header': 'true',
            },
          },
        })
      )
    })

    it('supports PATCH request with query parameter', async () => {
      await assertQueryParameter(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/patch/query?userId=abc',
          options: {
            method: 'PATCH',
          },
        }),
        {
          userId: 'abc',
        }
      )
    })
  })

  /**
   * DELETE
   */
  describe('DELETE', () => {
    it('supports DELETE request', async () => {
      await assertIntercepted(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/delete',
          options: {
            method: 'DELETE',
          },
        })
      )
    })

    it('supports DELETE request with headers', async () => {
      await assertHeaders(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/delete/headers',
          options: {
            method: 'DELETE',
            headers: {
              'x-custom-header': 'true',
            },
          },
        })
      )
    })

    it('supports DELETE request with query parameter', async () => {
      await assertQueryParameter(
        pool,
        createRequest({
          using: https.request,
          url: 'https://httpbin.org/delete/query?userId=abc',
          options: {
            method: 'DELETE',
          },
        }),
        {
          userId: 'abc',
        }
      )
    })
  })
})
