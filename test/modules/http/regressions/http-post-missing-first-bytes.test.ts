// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2309
 */
import http from 'node:http'
import path from 'node:path'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { vi, afterAll, beforeAll, afterEach, it, expect } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import superagent from 'superagent'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.post('/upload', (req, res) => {
    res.status(200).json({
      contentType: req.header('content-type'),
      contentLength: req.header('content-length'),
    })
  })
})

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

it('does not skip first request bytes on passthrough POST request', async () => {
  const socketDataCallback = vi.fn()

  const underlyingServer = httpServer['_http'] as http.Server
  underlyingServer.on('connection', (socket) => {
    socket.on('data', (chunk) => socketDataCallback(chunk.toString('utf8')))
  })

  const response = await superagent
    .post(httpServer.http.url('/upload'))
    .attach(
      'file',
      /**
       * @note The issue is only reproducible when providing a path
       * to the uploaded file. Providing buffer works fine.
       */
      path.resolve(__dirname, 'http-post-missing-first-bytes-file.png')
    )
    .timeout(1000)
    .catch((error) => {
      console.error(error)
      expect.fail('Request must not error')
    })

  expect(response.status).toBe(200)
  // Must send the uploaded file to the server.
  expect(response.body).toEqual({
    contentType: expect.stringMatching('multipart/form-data; boundary='),
    contentLength: '3723',
  })

  // Must send correct request headers.
  expect(socketDataCallback).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('POST /upload HTTP/1.1\r\n')
  )
})
