import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import zlib from 'zlib'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

function compress(value: string): Buffer {
  return zlib.gzipSync(zlib.brotliCompressSync(value))
}

const httpServer = new HttpServer((app) => {
  app.get('/compressed', (_req, res) => {
    res.set('Content-Encoding', 'gzip, br').end(compress('hello world'))
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('decompresses a mocked "content-encoding: gzip, br" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(compress('hello world'), {
        headers: {
          'Content-Encoding': 'gzip, br',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')

  expect(response.status).toBe(200)
  // Must read as decompressed response.
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: gzip, br" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'))

  expect(response.status).toBe(200)
  // Must read as decompressed response.
  expect(await response.text()).toBe('hello world')
})
