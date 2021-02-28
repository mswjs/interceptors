/**
 * @jest-environment node
 * @see https://github.com/mswjs/node-request-interceptor/issues/32
 */
import https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { getRequestOptionsByUrl } from '../../src/utils/getRequestOptionsByUrl'
import { IsomoprhicRequest } from '../../src/createInterceptor'

let pool: IsomoprhicRequest[] = []
let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    // All requests in this test are bypassed.
    pool.push(request)
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.post('/user', (req, res) => {
      req.pipe(res)
    })
  })

  interceptor.apply()
})

afterEach(() => {
  pool = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('supports original HTTPS request with a body written via "req.write()"', (done) => {
  let resBody = ''

  const req = https.request(
    {
      ...getRequestOptionsByUrl(new URL(server.https.makeUrl('/user'))),
      method: 'POST',
      agent: httpsAgent,
    },
    (res) => {
      res.on('data', (chunk) => (resBody += chunk))
      res.on('error', done)
      res.on('end', () => {
        // Assert the request that middleware intercepts.
        expect(pool).toHaveLength(1)
        expect(pool[0].method).toBe('POST')
        expect(pool[0].body).toBe('chunk-one')

        // Assert the actual response.
        expect(resBody).toEqual('chunk-one')

        done()
      })
    }
  )

  req.write('chunk-one')
  req.end()
})

test('supports original HTTPS request with a body given to "req.end()"', (done) => {
  let resBody = ''

  const req = https.request(
    {
      ...getRequestOptionsByUrl(new URL(server.https.makeUrl('/user'))),
      method: 'POST',
      agent: httpsAgent,
    },
    (res) => {
      res.on('data', (chunk) => (resBody += chunk))
      res.on('end', () => {
        expect(pool).toHaveLength(1)
        expect(pool[0].method).toBe('POST')
        expect(pool[0].body).toBe('chunk-end')
        expect(resBody).toEqual('chunk-end')

        done()
      })
    }
  )

  req.end('chunk-end')
})

test('supports original HTTPS request with a body written via both "req.write()" and "req.end()"', (done) => {
  let resBody = ''

  const req = https.request(
    {
      ...getRequestOptionsByUrl(new URL(server.https.makeUrl('/user'))),
      method: 'POST',
      agent: httpsAgent,
    },
    (res) => {
      res.on('data', (chunk) => (resBody += chunk))
      res.on('end', () => {
        expect(pool).toHaveLength(1)
        expect(pool[0].method).toBe('POST')
        expect(pool[0].body).toBe('chunk-onechunk-two')
        expect(resBody).toEqual('chunk-onechunk-two')

        done()
      })
    }
  )

  req.write('chunk-one')
  req.end('chunk-two')
})
