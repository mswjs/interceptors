/**
 * Ensure that reading the response body stream for the internal "response"
 * event does not lock that stream for any further reading.
 * @see https://github.com/mswjs/interceptors/issues/161
 */
import http, { IncomingMessage } from 'http'
import { createServer, ServerApi } from '@open-draft/test-server'
import {
  createInterceptor,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let requests: IsomorphicRequest[] = []
let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    requests.push(request)
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/user', (req, res) => {
      res.status(200).send('user-body')
    })
  })

  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('allows reading the response body after it has been read internally', async () => {
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
      const request = http.get(httpServer.http.makeUrl('/user'))
      request.on('response', (response) => {
        resolve(new RequestTransformer(response))
      })
      request.on('error', reject)
    })
  }

  const request = await makeRequest()
  const capturedResponse = await new Promise<IsomorphicResponse>((resolve) => {
    interceptor.on('response', (_, response) => resolve(response))
  })

  // Original response.
  expect(request.response.statusCode).toEqual(200)
  expect(request.response.statusMessage).toEqual('OK')
  expect(request.response.headers).toHaveProperty('x-powered-by', 'Express')
  const text = await request.toText()
  expect(text).toEqual('user-body')

  // Isomorphic response (callback).
  expect(capturedResponse.status).toEqual(200)
  expect(capturedResponse.statusText).toEqual('OK')
  expect(capturedResponse.headers.get('x-powered-by')).toEqual('Express')
  expect(capturedResponse.body).toEqual('user-body')
})
