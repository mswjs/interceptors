/**
 * @jest-environment jsdom
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import {
  createInterceptor,
  IsomorphicRequest,
  IsomorphicResponse,
} from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../helpers'

let httpServer: ServerApi
let responses: [IsomorphicRequest, IsomorphicResponse][] = []

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    if (['https://mswjs.io/events'].includes(request.url.href)) {
      return {
        status: 200,
        headers: {
          'x-response-type': 'mocked',
        },
        body: 'mocked-response-text',
      }
    }
  },
})

beforeAll(async () => {
  // @ts-expect-error Internal JSDOM property.
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  httpServer = await createServer((app) => {
    app.post('/account', (req, res) => {
      return res
        .status(200)
        .set('access-control-expose-headers', 'x-response-type')
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

test('XMLHttpRequest: emits the "response" event upon the mocked response', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', 'https://mswjs.io/events')
    req.setRequestHeader('x-request-custom', 'yes')
  })

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  // Isomorphic request.
  expect(request.method).toEqual('GET')
  expect(request.url.href).toEqual('https://mswjs.io/events')
  expect(request.headers.get('x-request-custom')).toEqual('yes')

  // Isomorphic response.
  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.headers.get('x-response-type')).toEqual('mocked')
  expect(response.body).toEqual('mocked-response-text')

  // Original response.
  expect(originalRequest.responseText).toEqual('mocked-response-text')
})

test('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.makeUrl('/account'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send('request-body')
  })

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  // Isomorphic request.
  expect(request.method).toEqual('POST')
  expect(request.url.href).toEqual(httpServer.https.makeUrl('/account'))
  expect(request.headers.get('x-request-custom')).toEqual('yes')
  expect(request.body).toEqual('request-body')

  // Isomorphic response.
  expect(response.status).toEqual(200)
  expect(response.statusText).toEqual('OK')
  expect(response.headers.get('x-response-type')).toEqual('original')
  expect(response.body).toEqual('original-response-text')

  // Original response.
  expect(originalRequest.responseText).toEqual('original-response-text')
})
