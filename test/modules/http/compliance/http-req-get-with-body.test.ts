// @see https://github.com/nock/nock/issues/2826
import http from 'node:http'
import { toWebResponse } from '#/test/helpers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

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
  const serverListenPromise = Promise.withResolvers<void>()
  httpServer.listen(52203, '127.0.0.1', () => {
    serverListenPromise.resolve()
  })
  await serverListenPromise.promise
})

afterAll(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  const serverClosePromise = Promise.withResolvers<void>()
  httpServer.close((error) => {
    if (error) {
      serverClosePromise.reject(error)
    }
    serverClosePromise.resolve()
  })
  await serverClosePromise.promise
})

it('allows an HTTP GET request with a body', async () => {
  const interceptedRequestPromise = Promise.withResolvers<Request>()

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

  const [response] = await toWebResponse(request)
  await expect(response.text()).resolves.toBe('hello world')

  const interceptedRequest = await interceptedRequestPromise.promise
  // The Fetch API representation of this request must NOT have any body.
  expect(interceptedRequest.body).toBeNull()
})
