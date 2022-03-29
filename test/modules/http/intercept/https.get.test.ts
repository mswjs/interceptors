/**
 * @jest-environment node
 */
import * as http from 'http'
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { Resolver } from '../../../../src/createInterceptor'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'

let httpServer: ServerApi

const resolver = jest.fn<ReturnType<Resolver>, Parameters<Resolver>>()
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver,
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/user', (req, res) => {
      res.status(200).send('user-body').end()
    })
  })

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('intercepts a GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.get(url, {
    agent: httpsAgent,
    headers: {
      'x-custom-header': 'yes',
    },
  })
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an https.get request given RequestOptions without a protocol', async () => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  const req = https.get({
    host: httpServer.https.getAddress().host,
    port: httpServer.https.getAddress().port,
    path: '/user?id=123',
    // Suppress the "certificate has expired" error.
    rejectUnauthorized: false,
  })
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})
