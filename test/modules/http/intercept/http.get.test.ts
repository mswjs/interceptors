/**
 * @jest-environment node
 */
import * as http from 'http'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor, Resolver } from '../../../../src'
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
      res.status(200).send('user-body')
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

test('intercepts an http.get request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { text } = await waitForClientRequest(req)

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
  expect(await text()).toEqual('user-body')
})

test('intercepts an http.get request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.get({
    host: httpServer.http.getAddress().host,
    port: httpServer.http.getAddress().port,
    path: '/user?id=123',
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.makeUrl('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
  expect(await text()).toEqual('user-body')
})
