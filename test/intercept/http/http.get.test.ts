/**
 * @jest-environment node
 */
import * as http from 'http'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { IsomorphicRequest } from '../../../src/createInterceptor'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'

let requests: IsomorphicRequest[] = []
let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    requests.push(request)
  },
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
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('intercepts an http.get request', (done) => {
  const url = httpServer.http.makeUrl('/user?id=123')
  http.get(
    url,
    {
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => {
      expect(requests).toHaveLength(1)

      const [request] = requests
      expect(request).toHaveProperty('method', 'GET')
      expect(request.url).toBeInstanceOf(URL)
      expect(request.url.href).toEqual(url)
      expect(request.url.searchParams.get('id')).toEqual('123')
      expect(request.headers.get('x-custom-header')).toEqual('yes')

      done()
    }
  )
})

test('intercepts an http.get request given RequestOptions without a protocol', (done) => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  http.get(
    {
      host: httpServer.http.getAddress().host,
      port: httpServer.http.getAddress().port,
      path: '/user?id=123',
    },
    () => {
      expect(requests).toHaveLength(1)

      const [request] = requests
      expect(request).toHaveProperty('method', 'GET')
      expect(request.url).toBeInstanceOf(URL)
      expect(request.url.href).toEqual(httpServer.http.makeUrl('/user?id=123'))
      expect(request.url.searchParams.get('id')).toEqual('123')

      done()
    }
  )
})
