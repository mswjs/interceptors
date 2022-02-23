/**
 * @jest-environment node
 */
import { Request } from 'node-fetch'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor, IsomorphicRequest, Resolver } from '../../../../src'
import nodeInterceptors from '../../../../src/presets/node'
import { fetch } from '../../../helpers'

let httpServer: ServerApi

const resolver = jest.fn<ReturnType<Resolver>, Parameters<Resolver>>()
const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver,
})

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
  interceptor.restore()
  await httpServer.close()
})

test('intercepts fetch requests constructed via a "Request" instance', async () => {
  const request = new Request(httpServer.http.makeUrl('/user'), {
    method: 'POST',
    headers: {
      'Content-Type': 'plain/text',
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
  const [capturedRequest] = resolver.mock.calls[0]

  expect(capturedRequest).toMatchObject<Partial<IsomorphicRequest>>({
    method: 'POST',
    url: new URL(httpServer.http.makeUrl('/user')),
    body: 'hello world',
  })
  expect(capturedRequest.headers.all()).toMatchObject({
    'content-type': 'plain/text',
    'user-agent': 'interceptors',
  })
})
