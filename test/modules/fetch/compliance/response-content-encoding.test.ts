import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import zlib from "zlib";
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const httpServer = new HttpServer((app) => {
  app.get('/compressed', (_req, res) => {
    res
      .set('Content-Encoding', 'gzip, br')
      .send(zlib.gzipSync(zlib.brotliCompressSync('Lorem ipsum dolor sit amet')))
      .end()
  })
})

const resolver = vi.fn<HttpRequestEventMap['request']>()

const interceptor = new FetchInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('support content-encoding: gzip, br for mocked request', async () => {
  const message = 'Lorem ipsum dolor sit amet'
  const compressed = zlib.brotliCompressSync(zlib.gzipSync(message))

  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response(compressed, {
      headers: { 
        'Content-Encoding': 'gzip, br',
       }
    }))
  })

  const response = await fetch('http://localhost')

  expect(response.status).toBe(200)
  expect(await response.text()).toBe(message)
})

it('support content-encoding: gzip, br for unmocked request', async () => {
  const message = 'Lorem ipsum dolor sit amet'
  const response = await fetch(httpServer.http.url('/compressed'))

  expect(response.status).toBe(200)
  expect(await response.text()).toBe(message)
})