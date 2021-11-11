/**
 * @jest-environment node
 */
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { IsomorphicRequest } from '../../../../src/createInterceptor'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'

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
      res.status(200).send('user-body').end()
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

test('intercepts a GET request', (done) => {
  const url = httpServer.https.makeUrl('/user?id=123')
  https.get(
    url,
    {
      agent: httpsAgent,
      headers: {
        'x-custom-header': 'yes',
      },
    },
    () => {
      expect(requests).toHaveLength(1)

      const [request] = requests
      expect(request.method).toEqual('GET')
      expect(request.url).toBeInstanceOf(URL)
      expect(request.url.href).toEqual(url)
      expect(request.url.searchParams.get('id')).toEqual('123')
      expect(request.headers.get('x-custom-header')).toEqual('yes')

      done()
    }
  )
})

test('intercepts an https.get request given RequestOptions without a protocol', (done) => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  https.get(
    {
      host: httpServer.https.getAddress().host,
      port: httpServer.https.getAddress().port,
      path: '/user?id=123',
      // Suppress the "certificate has expired" error.
      rejectUnauthorized: false,
    },
    () => {
      expect(requests).toHaveLength(1)

      const [request] = requests
      expect(request.method).toEqual('GET')
      expect(request.url).toBeInstanceOf(URL)
      expect(request.url.href).toEqual(httpServer.https.makeUrl('/user?id=123'))
      expect(request.url.searchParams.get('id')).toEqual('123')

      done()
    }
  )
})

test('sets "credentials" to "omit" on the isomorphic request', (done) => {
  https.get(httpServer.http.makeUrl('/user'), () => {
    const [request] = requests
    expect(request.credentials).toEqual('omit')

    done()
  })
})
