/**
 * @jest-environment jsdom
 */
import * as http from 'http'
import { createServer, ServerApi } from '@open-draft/test-server'
import { HttpRequestEventMap, InterceptorEventsMap } from '../../../src'
import { createXMLHttpRequest, waitForClientRequest } from '../../helpers'
import { anyUuid, headersContaining } from '../../jest.expect'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const interceptor = new ClientRequestInterceptor()

const requestListener = jest.fn<
  ReturnType<InterceptorEventsMap['request']>,
  Parameters<InterceptorEventsMap['request']>
>()
interceptor.on('request', requestListener)

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/user', (req, res) => {
      res.status(201).end()
    })
  })

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
  const url = httpServer.http.makeUrl('/user')
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
  >({
    id: anyUuid(),
    method: 'POST',
    url: new URL(url),
    headers: headersContaining({
      'content-type': 'application/json',
    }),
    credentials: expect.anything(),
    body: JSON.stringify({ userId: 'abc-123' }),
    respondWith: expect.any(Function),
  })
})

test.skip('XMLHttpRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.makeUrl('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(requestListener).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >({
    id: anyUuid(),
    method: 'POST',
    url: new URL(url),
    headers: headersContaining({
      'content-type': 'application/json',
    }),
    credentials: 'same-origin',
    body: JSON.stringify({ userId: 'abc-123' }),
    respondWith: expect.any(Function),
  })
})
