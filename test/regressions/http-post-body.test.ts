/**
 * @jest-environment node
 * @see https://github.com/mswjs/node-request-interceptor/issues/32
 */
import https from 'https'
import { RequestInterceptor, InterceptedRequest } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { ServerAPI, createServer, httpsAgent } from '../utils/createServer'
import { getRequestOptionsByUrl } from '../../src/utils/getRequestOptionsByUrl'

let interceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerAPI

beforeAll(async () => {
  server = await createServer((app) => {
    app.post('/user', (req, res) => {
      req.pipe(res)
    })
  })

  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    // All requests in this test are bypassed.
    pool.push(req)
  })
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
      ...getRequestOptionsByUrl(new URL(server.makeHttpsUrl('/user'))),
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
      ...getRequestOptionsByUrl(new URL(server.makeHttpsUrl('/user'))),
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
      ...getRequestOptionsByUrl(new URL(server.makeHttpsUrl('/user'))),
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
