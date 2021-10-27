/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import {
  createInterceptor,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../src'
import nodeInterceptors from '../../src/presets/node'
import { httpsRequest } from '../helpers'

let httpServer: ServerApi
let responses: [IsomorphicRequest, IsomorphicResponse][] = []

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(request) {
    if (request.url.pathname === '/mocked') {
      return {
        status: 200,
        headers: {
          'x-response-type': 'mocked',
        },
        body: 'response-text',
      }
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/account', (req, res) => {
      return res
        .status(200)
        .set('x-response-type', 'original')
        .send('original-response-text')
    })
  })

  interceptor.apply()
  interceptor.on('response', (req, res) => {
    responses.push([req, res])
  })
})

afterEach(() => {
  responses = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('fetch: emits the "response" event upon the mocked response', async () => {
  const originalResponse = await fetch(httpServer.https.makeUrl('/mocked'))

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  // Isomorphic request.
  expect(request).toHaveProperty('method', 'GET')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.toString()).toBe(httpServer.https.makeUrl('/mocked'))
  expect(request).toHaveProperty('body', '')

  // Isomorphic response.
  expect(response).toHaveProperty('status', 200)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(response).toHaveProperty('body', 'response-text')

  // Original response.
  expect(originalResponse.status).toEqual(200)
  expect(originalResponse.statusText).toEqual('OK')
  expect(originalResponse.headers.get('x-response-type')).toEqual('mocked')
  expect(await originalResponse.text()).toEqual('response-text')
})

test('ClientRequest: emits the "response" event upon the mocked response', async () => {
  const { res, resBody } = await httpsRequest(
    httpServer.https.makeUrl('/mocked'),
    { agent: httpsAgent }
  )

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  // Isomorphic request.
  expect(request).toHaveProperty('method', 'GET')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.toString()).toBe(httpServer.https.makeUrl('/mocked'))
  expect(request).toHaveProperty('body', '')

  // Isomorphic response.
  expect(response).toHaveProperty('status', 200)
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(response).toHaveProperty('body', 'response-text')

  // Original response.
  expect(res.statusCode).toEqual(200)
  expect(res.statusMessage).toEqual(undefined)
  expect(res.headers).toHaveProperty('x-response-type', 'mocked')
  expect(resBody).toEqual('response-text')
})

test('ClientRequest: emits the "response" event upon the original response', async () => {
  const { res, resBody } = await httpsRequest(
    httpServer.https.makeUrl('/account'),
    {
      agent: httpsAgent,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Custom': 'yes',
      },
    },
    JSON.stringify({ id: 'abc-123' })
  )

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  // Isomorphic request.
  expect(request.method).toEqual('POST')
  expect(request.url).toBeInstanceOf(URL)
  expect(request.url.toString()).toBe(httpServer.https.makeUrl('/account'))
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.headers.get('x-request-custom')).toBe('yes')
  expect(request.body).toEqual(`{"id":"abc-123"}`)

  // Isomorphic response.
  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.headers.get('x-response-type')).toBe('original')
  expect(response.body).toEqual('original-response-text')

  // Original response.
  expect(res.statusCode).toEqual(200)
  expect(res.statusMessage).toEqual('OK')
  expect(res.headers).toHaveProperty('x-powered-by', 'Express')
  expect(resBody).toEqual('original-response-text')
})
