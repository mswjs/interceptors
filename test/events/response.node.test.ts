/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import {
  RequestInterceptor,
  InterceptedRequest,
  MockedResponse,
} from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { httpsRequest } from '../helpers'

let server: ServerApi
let interceptor: RequestInterceptor
let responses: [InterceptedRequest, Partial<MockedResponse>][] = []

beforeAll(async () => {
  server = await createServer((app) => {
    app.post('/account', (req, res) => {
      return res
        .status(200)
        .set('x-response-type', 'original')
        .send('original-response-text')
    })
  })

  interceptor = new RequestInterceptor({
    modules: withDefaultInterceptors,
  })
  interceptor.use((req) => {
    if (['https://mswjs.io/events'].includes(req.url.href)) {
      return {
        status: 200,
        headers: {
          'x-response-type': 'mocked',
        },
        body: 'response-text',
      }
    }
  })
  interceptor.on('response', (req, res) => {
    responses.push([req, res])
  })
})

afterEach(() => {
  responses = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('ClientRequest: emits the "response" event upon the mocked response', async () => {
  await fetch('https://mswjs.io/events')

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  expect(request).toHaveProperty('method', 'GET')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.toString()).toBe('https://mswjs.io/events')
  expect(request).toHaveProperty('body', '')

  expect(response).toHaveProperty('status', 200)
  expect(response.headers).toHaveProperty('x-response-type', 'mocked')
  expect(response).toHaveProperty('body', 'response-text')
})

test('ClientRequest: emits the "response" event upon the original response', async () => {
  await httpsRequest(
    server.https.makeUrl('/account'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Custom': 'yes',
      },
      agent: httpsAgent,
    },
    JSON.stringify({ id: 'abc-123' })
  )

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  expect(request).toHaveProperty('method', 'POST')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.toString()).toBe(server.https.makeUrl('/account'))
  expect(request.headers).toHaveProperty('content-type', 'application/json')
  expect(request.headers).toHaveProperty('x-request-custom', 'yes')
  expect(request).toHaveProperty('body', `{"id":"abc-123"}`)

  expect(response).toHaveProperty('status', 200)
  expect(response).toHaveProperty('statusText', 'OK')
  expect(response.headers).toHaveProperty('x-response-type', 'original')
  expect(response).toHaveProperty('body', 'original-response-text')
})
