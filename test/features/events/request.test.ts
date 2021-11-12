/**
 * @jest-environment jsdom
 */
import * as http from 'http'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor, IsomorphicRequest } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { createXMLHttpRequest } from '../../helpers'

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
    app.post('/user', (_req, res) => {
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

test('ClientRequest: emits the "request" event upon the request', (done) => {
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

test('XMLHttpRequest: emits the "request" event upon the request', async () => {
  await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.http.makeUrl('/user'))
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  expect(requests).toHaveLength(2)

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
