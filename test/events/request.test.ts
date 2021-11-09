/**
 * @jest-environment jsdom
 */
import * as http from 'http'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor, IsomorphicRequest } from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { createXMLHttpRequest, httpRequest } from '../helpers'

let requests: IsomorphicRequest[] = []
let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest, interceptXMLHttpRequest],
  resolver() {},
})

interceptor.on('request', (request) => {
  requests.push(request)
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/user', (req, res) => {
      res.status(201).end()
    })
  })

  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

it('ClientRequest: emits the "request" event upon the request', (done) => {
  const request = http.request(
    httpServer.http.makeUrl('/user'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    () => {
      expect(requests).toHaveLength(1)
      const [request] = requests

      expect(request.method).toEqual('POST')
      expect(request.url.href).toEqual(httpServer.http.makeUrl('/user'))
      expect(request.headers.get('content-type')).toEqual('application/json')
      expect(request.body).toEqual(JSON.stringify({ userId: 'abc-123' }))
      done()
    }
  )
  request.write(JSON.stringify({ userId: 'abc-123' }))
  request.end()
})

it('XMLHttpRequest: emits the "request" event upon the request', async () => {
  await createXMLHttpRequest((request) => {
    request.open('POST', httpServer.http.makeUrl('/user'))
    request.setRequestHeader('Content-Type', 'application/json')
    request.send(JSON.stringify({ userId: 'abc-123' }))
  })

  /**
   * @note In Node.js "XMLHttpRequest" is often polyfilled by "ClientRequest".
   * This results in both "XMLHttpRequest" and "ClientRequest" interceptors
   * emitting the "request" event.
   * @see https://github.com/mswjs/interceptors/issues/163
   */
  expect(requests).toHaveLength(4)

  const [request] = requests
  expect(request.method).toEqual('POST')
  expect(request.url.href).toEqual(httpServer.http.makeUrl('/user'))
  expect(request.headers.get('content-type')).toEqual('application/json')
  expect(request.body).toEqual(
    JSON.stringify({
      userId: 'abc-123',
    })
  )
})
