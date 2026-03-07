// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/interceptors/issues/308
 */
import { HttpServer } from '@open-draft/test-server/http'
import zlib from 'zlib'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/compressed', (_req, res) => {
    res
      .status(200)
      .set('Content-Encoding', 'gzip')
      .send(zlib.gzipSync(Buffer.from('compressed-body')))
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('bypasses a compressed HTTP request', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/compressed'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toEqual(200)
  expect(request.response).toEqual('compressed-body')
  expect(request.responseText).toBe('compressed-body')
})
