import {
  InterceptedRequest,
  MockedResponse,
  RequestInterceptor,
} from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../helpers'
import { createServer, ServerAPI } from '../utils/createServer'

let server: ServerAPI
let interceptor: RequestInterceptor
let responses: [InterceptedRequest, Partial<MockedResponse>][] = []

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

  interceptor = new RequestInterceptor([interceptXMLHttpRequest])
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
  expect(response.headers).toHaveProperty('x-response-type', 'mocked')
  expect(response).toHaveProperty('body', 'response-text')
})

test('XMLHttpRequest: emits the "response" event upon the original response', async () => {
  await createXMLHttpRequest((req) => {
    req.open('POST', server.makeHttpsUrl('/account'))
    req.setRequestHeader('x-request-custom', 'yes')
    req.send('request-body')
  })

  expect(responses).toHaveLength(1)
  const [request, response] = responses[0]

  expect(request).toHaveProperty('method', 'POST')
  expect(request.url.toString()).toBe(server.makeHttpsUrl('/account'))
  expect(request.headers).toHaveProperty('x-request-custom', 'yes')
  expect(request).toHaveProperty('body', 'request-body')

  expect(response).toHaveProperty('status', 200)
  expect(response).toHaveProperty('statusText', 'OK')
  expect(response.headers).toHaveProperty('x-response-type', 'original')
  expect(response).toHaveProperty('body', 'original-response-text')
})
