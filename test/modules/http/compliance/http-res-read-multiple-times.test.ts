/**
 * @vitest-environment node
 * Ensure that reading the response body stream for the internal "response"
 * event does not lock that stream for any further reading.
 * @see https://github.com/mswjs/interceptors/issues/161
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http, { IncomingMessage } from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const resolver = vi.fn<(...args: HttpRequestEventMap['request']) => void>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('allows reading the response body after it has been read internally', async () => {
  /**
   * @note This is a deliberate setup that replicates Stripe's Node.js client internals.
   */
  class RequestTransformer {
    response: IncomingMessage

    constructor(response: IncomingMessage) {
      this.response = response
    }

    toText(): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        let responseBody = ''
        this.response.setEncoding('utf8')
        this.response.on('data', (chunk) => (responseBody += chunk))
        this.response.on('error', reject)
        this.response.once('end', () => {
          resolve(responseBody)
        })
      })
    }
  }

  const makeRequest = (): Promise<RequestTransformer> => {
    return new Promise((resolve, reject) => {
      const request = http.get(httpServer.http.url('/user'))
      request.on('response', (response) => {
        resolve(new RequestTransformer(response))
      })
      request.on('error', reject)
    })
  }

  const untilCapturedResponse = new Promise<Response>((resolve) => {
    interceptor.on('response', ({ response }) => resolve(response))
  })
  const request = await makeRequest()
  const capturedResponse = await untilCapturedResponse

  // Original response.
  expect(request.response.statusCode).toBe(200)
  expect(request.response.statusMessage).toBe('OK')
  expect(request.response.headers).toHaveProperty('x-powered-by', 'Express')
  const text = await request.toText()
  expect(text).toBe('user-body')

  // Response from the "response" callback.
  expect(capturedResponse.status).toBe(200)
  expect(capturedResponse.statusText).toBe('OK')
  expect(capturedResponse.headers.get('x-powered-by')).toBe('Express')
  expect(capturedResponse.bodyUsed).toBe(false)
  expect(await capturedResponse.text()).toBe('user-body')
})
