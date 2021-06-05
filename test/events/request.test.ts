/**
 * @jest-environment jsdom
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor, IsomorphicRequest } from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { createXMLHttpRequest, httpRequest } from '../helpers'

let requests: IsomorphicRequest[] = []
let server: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest, interceptXMLHttpRequest],
  resolver() {},
})

interceptor.on('request', (request) => {
  requests.push(request)
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.post('/user', (req, res) => {
      res.status(200).end()
    })
  })

  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

it('ClientRequest: emits the "request" event upon a request', async () => {
  await httpRequest(
    server.http.makeUrl('/user'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    JSON.stringify({
      userId: 'abc-123',
    })
  )
  const [request] = requests

  expect(requests).toHaveLength(1)
  expect(request.method).toEqual('POST')
  expect(request.url.toString()).toEqual(server.http.makeUrl('/user'))
  expect(request.headers.all()).toEqual({ 'content-type': 'application/json' })
  expect(request.body).toEqual(JSON.stringify({ userId: 'abc-123' }))
})

it('XMLHttpRequest: emits the "request" event upon a request', async () => {
  await createXMLHttpRequest((req) => {
    req.open('POST', server.http.makeUrl('/user'))
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })
  const [request] = requests

  /**
   * @note In Node.js XMLHttpRequest is often polyfilled by ClientRequest.
   * This results in both XMLHttpRequest and ClientRequest interceptors
   * emitting the "request" event.
   */
  expect(requests).toHaveLength(4)
  expect(request.method).toEqual('POST')
  expect(request.url.toString()).toEqual(server.http.makeUrl('/user'))
  expect(request.headers.all()).toEqual({ 'content-type': 'application/json' })
  expect(request.body).toEqual(JSON.stringify({ userId: 'abc-123' }))
})
