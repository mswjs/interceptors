// @vitest-environment happy-dom
import type { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { useCors, REQUEST_ID_REGEXP } from '#/test/helpers'
import { toArrayBuffer, encodeBuffer } from '#/src/utils/bufferUtils'
import { RequestController } from '#/src/RequestController'
import { HttpRequestEventMap } from '#/src/glossary'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  app.use(useCors, (req, res, next) => {
    res.set({
      'Access-Control-Allow-Credentials': 'true',
    })
    return next()
  })

  const handleUserRequest: RequestHandler = (_req, res) => {
    res.status(200).send('user-body').end()
  }

  app.get('/user', handleUserRequest)
  app.post('/user', handleUserRequest)
  app.put('/user', handleUserRequest)
  app.delete('/user', handleUserRequest)
  app.patch('/user', handleUserRequest)
  app.head('/user', handleUserRequest)
})

const resolver = vi.fn<(...args: HttpRequestEventMap['request']) => void>()

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  await httpServer.listen()

  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds with an ArrayBuffer when "responseType" equals "arraybuffer"', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.https.url('/user'))
  request.responseType = 'arraybuffer'
  request.send()

  await waitForXMLHttpRequest(request)

  const expectedArrayBuffer = toArrayBuffer(encodeBuffer('user-body'))
  const responseBuffer = request.response as ArrayBuffer

  // Must return an "ArrayBuffer" instance for "arraybuffer" response type.
  expect(request.responseType).toBe('arraybuffer')
  expect(responseBuffer).toBeInstanceOf(ArrayBuffer)
  expect(responseBuffer.byteLength).toBe(expectedArrayBuffer.byteLength)
  expect(
    Buffer.from(responseBuffer).compare(Buffer.from(expectedArrayBuffer))
  ).toBe(0)
})
