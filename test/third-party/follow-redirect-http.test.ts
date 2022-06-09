/**
 * @jest-environment jsdom
 */
import { https } from 'follow-redirects'
import { httpsAgent, HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import type { HttpRequestEventMap } from '../../src/glossary'
import { waitForClientRequest } from '../helpers'

const resolver = jest.fn<never, Parameters<HttpRequestEventMap['request']>>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

const server = new HttpServer((app) => {
  app.post('/resource', (req, res) => {
    res.status(200).send('hello from the server')
  })
})

beforeAll(async () => {
  await server.listen()
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

test('intercepts a POST request issued by "follow-redirects"', async () => {
  const { address } = server.https
  const payload = JSON.stringify({ todo: 'Buy the milk' })

  const req = https.request({
    hostname: address.host,
    port: address.port,
    path: '/resource',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
    },
    agent: httpsAgent,
  })

  req.end(payload)

  const { text } = await waitForClientRequest(req as any)
  expect(resolver).toHaveBeenCalledTimes(1)

  // Intercepted request.
  const request = resolver.mock.calls[0][0]

  expect(request.method).toBe('POST')
  expect(request.url.href).toBe(server.https.url('/resource'))
  expect(request.credentials).toBe('same-origin')
  expect(request.headers.get('Content-Type')).toBe('application/json')
  expect(request.headers.get('Content-Length')).toBe('23')
  expect(request.body).toBe(JSON.stringify({ todo: 'Buy the milk' }))

  // Response (original).
  expect(await text()).toBe('hello from the server')
})
