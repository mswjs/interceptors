/**
 * @jest-environment jsdom
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../src'
import { createXMLHttpRequest, waitForClientRequest } from '../../helpers'
import { anyUuid, headersContaining } from '../../jest.expect'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'
import { BatchInterceptor } from '../../../src/BatchInterceptor'
import { XMLHttpRequestInterceptor } from '../../../src/interceptors/XMLHttpRequest'
import { encodeBuffer } from '../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  app.post('/user', (req, res) => {
    res.status(201).end()
  })
})

const requestListener = jest.fn<
  ReturnType<HttpRequestEventMap['request']>,
  Parameters<HttpRequestEventMap['request']>
>()

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
  ],
})
interceptor.on('request', requestListener)

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

test('ClientRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.url('/user')
  const req = http.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  req.write(JSON.stringify({ userId: 'abc-123' }))
  req.end()
  await waitForClientRequest(req)

  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(requestListener).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'content-type': 'application/json',
      }),
      credentials: expect.anything(),
      _body: encodeBuffer(JSON.stringify({ userId: 'abc-123' })),
      respondWith: expect.any(Function),
    })
  )
})

test('XMLHttpRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.url('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  /**
   * @note There are two "request" events emitted because XMLHttpRequest
   * is polyfilled by "http.ClientRequest" in JSDOM. When this request gets
   * bypassed by XMLHttpRequest interceptor, JSDOM constructs "http.ClientRequest"
   * to perform it as-is. This issues an additional OPTIONS request first.
   */
  expect(requestListener).toHaveBeenCalledTimes(2)
  expect(requestListener).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'content-type': 'application/json',
      }),
      credentials: 'omit',
      _body: encodeBuffer(JSON.stringify({ userId: 'abc-123' })),
      respondWith: expect.any(Function),
    })
  )
})
