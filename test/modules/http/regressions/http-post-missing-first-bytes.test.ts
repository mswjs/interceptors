// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2309
 */
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  createTestHttpServer,
  kServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import superagent from 'superagent'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.post('/upload', (ctx) => {
        return Response.json({
          contentType: ctx.req.header('content-type'),
          contentLength: ctx.req.header('content-length'),
        })
      })
    },
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not skip the first request bytes on passthrough POST request', async () => {
  const socketDataCallback = vi.fn()

  const underlyingServer = Reflect.get(httpServer.http, kServer) as http.Server
  underlyingServer.on('connection', (socket) => {
    socket.on('data', (chunk) => socketDataCallback(chunk.toString('utf8')))
  })

  const response = await superagent
    .post(httpServer.http.url('/upload').href)
    .attach(
      'file',
      /**
       * @note The issue is only reproducible when providing a path
       * to the uploaded file. Providing buffer works fine.
       */
      fileURLToPath(
        new URL('./http-post-missing-first-bytes-file.png', import.meta.url)
      )
    )
    .timeout(1000)
    .catch((error) => {
      console.error(error)
      expect.fail('Request must not error')
    })

  expect.soft(response.status).toBe(200)
  expect.soft(response.body).toEqual({
    contentType: expect.stringMatching('multipart/form-data; boundary='),
    contentLength: '3723',
  })

  expect(socketDataCallback).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('POST /upload HTTP/1.1\r\n')
  )
})
