import { ServerApi, createServer } from '@open-draft/test-server'
import {
  IsomoprhicRequest,
  createInterceptor,
  IsomoprhicResponse,
} from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../helpers'

let server: ServerApi
let responses: [IsomoprhicRequest, IsomoprhicResponse][] = []

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    if (['https://mswjs.io/events'].includes(request.url.href)) {
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
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  server = await createServer((app) => {
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
  await server.close()
})

test('XMLHttpRequest: emits the "response" event upon the mocked response', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', 'https://mswjs.io/events')
    req.setRequestHeader('x-request-custom', 'yes')
  })

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  expect(request).toHaveProperty('method', 'GET')
  expect(request.url.toString()).toBe('https://mswjs.io/events')
  expect(request.headers).toHaveProperty('x-request-custom', 'yes')

  expect(response).toHaveProperty('status', 200)
  expect(response).toHaveProperty('statusText', 'OK')
  expect(response.headers.get('x-response-type')).toBe('mocked')
  expect(response).toHaveProperty('body', 'response-text')
})

test('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  await createXMLHttpRequest((req) => {
    req.open('POST', server.https.makeUrl('/account'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send('request-body')
  })

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  expect(request).toHaveProperty('method', 'POST')
  expect(request.url.toString()).toBe(server.https.makeUrl('/account'))
  expect(request.headers).toHaveProperty('x-request-custom', 'yes')
  expect(request).toHaveProperty('body', 'request-body')

  expect(response).toHaveProperty('status', 200)
  expect(response).toHaveProperty('statusText', 'OK')
  expect(response.headers.get('x-response-type')).toBe('original')
  expect(response).toHaveProperty('body', 'original-response-text')
})
