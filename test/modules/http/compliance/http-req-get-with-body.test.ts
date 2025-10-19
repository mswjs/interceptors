/**
 * @see https://github.com/nock/nock/issues/2826
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

const httpServer = new http.Server((req, res) => {
  if (req.url === '/resource') {
    req.pipe(res)
    return
  }

  res.statusCode = 404
  res.end()
})

beforeAll(async () => {
  interceptor.apply()
  const serverListenPromise = new DeferredPromise<void>()
  httpServer.listen(52203, '127.0.0.1', () => {
    serverListenPromise.resolve()
  })
  await serverListenPromise
})

afterAll(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  const serverClosePromise = new DeferredPromise<void>()
  httpServer.close((error) => {
    if (error) {
      serverClosePromise.reject(error)
    }
    serverClosePromise.resolve()
  })
  await serverClosePromise
})

it('allows an HTTP GET request with a body', async () => {
  const interceptedRequestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request }) => {
    interceptedRequestPromise.resolve(request)
  })

  const request = http.request('http://127.0.0.1:52203/resource', {
    method: 'GET',
    headers: {
      'content-type': 'text/plain',
      'content-length': '11',
    },
  })

  /**
   * @note Although it is invalid to have GET requests with a body
   * per Fetch API specification, you should still be able to perform
   * such requests in Node.js without the library throwing an error.
   */
  request.write('hello world')
  request.end()

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('hello world')

  const interceptedRequest = await interceptedRequestPromise
  // The Fetch API representation of this request must NOT have any body.
  expect(interceptedRequest.body).toBeNull()
})
