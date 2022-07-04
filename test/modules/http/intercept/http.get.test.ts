/**
 * @jest-environment node
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
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

test('intercepts an http.get request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { text } = await waitForClientRequest(req)

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
  expect(await text()).toEqual('user-body')
})

test('intercepts an http.get request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.get({
    host: httpServer.http.address.host,
    port: httpServer.http.address.port,
    path: '/user?id=123',
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
  expect(await text()).toEqual('user-body')
})
