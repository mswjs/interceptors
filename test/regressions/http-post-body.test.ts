/**
 * @jest-environment node
 * @see https://github.com/mswjs/node-request-interceptor/issues/32
 */
import https from 'https'
import { RequestInterceptor, InterceptedRequest } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'

let interceptor: RequestInterceptor
let pool: InterceptedRequest[] = []

beforeAll(() => {
  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    // All requests in this test are bypassed.
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(() => {
  interceptor.restore()
})

test('supports original HTTPS request with a body written via "req.write()"', (done) => {
  let resBody = ''
  const req = https.request(
    {
      method: 'POST',
      protocol: 'https:',
      hostname: 'httpbin.org',
      path: '/post',
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
        const resBodyJson = JSON.parse(resBody)
        expect(resBodyJson).toHaveProperty('url', 'https://httpbin.org/post')
        expect(resBodyJson).toHaveProperty('data', 'chunk-one')

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
      method: 'POST',
      protocol: 'https:',
      hostname: 'httpbin.org',
      path: '/post',
    },
    (res) => {
      res.on('data', (chunk) => (resBody += chunk))
      res.on('end', () => {
        expect(pool).toHaveLength(1)
        expect(pool[0].method).toBe('POST')
        expect(pool[0].body).toBe('chunk-end')

        const resBodyJson = JSON.parse(resBody)
        expect(resBodyJson).toHaveProperty('url', 'https://httpbin.org/post')
        expect(resBodyJson).toHaveProperty('data', 'chunk-end')

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
      method: 'POST',
      protocol: 'https:',
      hostname: 'httpbin.org',
      path: '/post',
    },
    (res) => {
      res.on('data', (chunk) => (resBody += chunk))
      res.on('end', () => {
        expect(pool).toHaveLength(1)
        expect(pool[0].method).toBe('POST')
        expect(pool[0].body).toBe('chunk-onechunk-two')

        const resBodyJson = JSON.parse(resBody)
        expect(resBodyJson).toHaveProperty('url', 'https://httpbin.org/post')
        expect(resBodyJson).toHaveProperty('data', 'chunk-onechunk-two')

        done()
      })
    }
  )

  req.write('chunk-one')
  req.end('chunk-two')
})
