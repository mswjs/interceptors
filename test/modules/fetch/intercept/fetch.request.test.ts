/**
 * @jest-environment node
 */
import { Request } from 'node-fetch'
import { createServer, ServerApi } from '@open-draft/test-server'
import { HttpRequestEventMap } from '../../../../src'
import { fetch } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const resolver = jest.fn<never, Parameters<HttpRequestEventMap['request']>>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/user', (_req, res) => {
      res.status(200).send('mocked')
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

test('intercepts fetch requests constructed via a "Request" instance', async () => {
  const request = new Request(httpServer.http.makeUrl('/user'), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'interceptors',
    },
    body: 'hello world',
  })
  const { res } = await fetch(request)

  // There's no mocked response returned from the resolver
  // so this request must hit an actual (test) server.
  expect(res.status).toEqual(200)
  expect(await res.text()).toEqual('mocked')

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >({
    id: anyUuid(),
    method: 'POST',
    url: new URL(httpServer.http.makeUrl('/user')),
    headers: headersContaining({
      'content-type': 'text/plain',
      'user-agent': 'interceptors',
    }),
    credentials: 'same-origin',
    body: 'hello world',
    respondWith: expect.any(Function),
  })
})
