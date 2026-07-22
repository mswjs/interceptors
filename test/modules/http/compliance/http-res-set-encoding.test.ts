// @vitest-environment node
import http, { IncomingMessage } from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (!url.searchParams.has('mock')) {
    return
  }

  controller.respondWith(
    new Response('hello world', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  )
})

function encode(text: string, encoding: BufferEncoding): string {
  return Buffer.from(text, 'utf8').toString(encoding)
}

function readIncomingMessage(res: http.IncomingMessage): any {
  return new Promise((resolve, reject) => {
    let body = ''
    res.on('data', (chunk) => (body += chunk))
    res.on('error', reject)
    res.on('end', () => resolve(body))
  })
}

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('hello world')
      })
    },
  })
})

afterAll(async () => {
  await httpServer.close()
  interceptor.dispose()
})

const encodings: BufferEncoding[] = [
  'ascii',
  'base64',
  'binary',
  'hex',
  'latin1',
  'ucs2',
  'ucs-2',
  'utf16le',
  'utf8',
  'utf-8',
]

describe('given the original response', () => {
  encodings.forEach((encoding) => {
    it(`reads the response body encoded with ${encoding}`, async () => {
      const request = http.get(httpServer.http.url('/resource').href)

      const responseTextReceived = Promise.withResolvers<IncomingMessage>()
      request.on('response', async (response) => {
        response.setEncoding(encoding)
        const text = await readIncomingMessage(response)
        responseTextReceived.resolve(text)
      })

      const responseText = await responseTextReceived.promise
      expect(responseText).toEqual(encode('hello world', encoding))
    })
  })
})

describe('given the mocked response', () => {
  encodings.forEach((encoding) => {
    it(`reads the response body encoded with ${encoding}`, async () => {
      const request = http.get(httpServer.http.url('/resource?mock=true').href)

      const responseTextReceived = Promise.withResolvers<IncomingMessage>()
      request.on('response', async (response) => {
        response.setEncoding(encoding)
        const text = await readIncomingMessage(response)
        responseTextReceived.resolve(text)
      })

      const responseText = await responseTextReceived.promise
      expect(responseText).toEqual(encode('hello world', encoding))
    })
  })
})
