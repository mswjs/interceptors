/**
 * @jest-environment node
 */
import * as https from 'https'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { HttpRequestEventMap } from '../../../../src'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body').end()
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an https.get request given RequestOptions without a protocol', async () => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  const req = https.get({
    host: httpServer.https.address.host,
    port: httpServer.https.address.port,
    path: '/user?id=123',
    // Suppress the "certificate has expired" error.
    rejectUnauthorized: false,
  })
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})
