/**
 * Ensure that reading the response body stream for the internal "response"
 * event does not lock that stream for any further reading.
 * @see https://github.com/mswjs/interceptors/issues/161
 */
import http, { IncomingMessage } from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap, IsomorphicResponse } from '../../../../src'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const resolver = jest.fn<never, Parameters<HttpRequestEventMap['request']>>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('allows reading the response body after it has been read internally', async () => {
  /**
   * @note This is a deliberate setup that replicates Stripe's Node.js client internals.
   */
  class RequestTransformer {
    response: IncomingMessage

    constructor(res: IncomingMessage) {
      this.response = res
    }

    toText(): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        let responseBody = ''

        this.response.setEncoding('utf8')
        this.response.on('data', (chunk) => {
          responseBody += chunk
        })
        this.response.once('error', reject)
        this.response.once('end', () => {
          resolve(responseBody)
        })
      })
    }
  }

  const makeRequest = (): Promise<RequestTransformer> => {
    return new Promise((resolve, reject) => {
      http
        .get(httpServer.http.url('/user'))
        .once('response', (res) => {
          resolve(new RequestTransformer(res))
        })
        .once('error', reject)
    })
  }
  const untilCapturedResponse = new Promise<IsomorphicResponse>((resolve) => {
    interceptor.on('response', (_, res) => {
      resolve(res)
    })
  })

  const req = await makeRequest()
  const capturedResponse = await untilCapturedResponse

  // Original response.
  expect(req.response.statusCode).toEqual(200)
  expect(req.response.statusMessage).toEqual('OK')
  expect(req.response.headers).toHaveProperty('x-powered-by', 'Express')
  const text = await req.toText()
  expect(text).toEqual('user-body')

  // Isomorphic response (callback).
  expect(capturedResponse.status).toEqual(200)
  expect(capturedResponse.statusText).toEqual('OK')
  expect(capturedResponse.headers.get('x-powered-by')).toEqual('Express')
  expect(capturedResponse.body).toEqual('user-body')
})
