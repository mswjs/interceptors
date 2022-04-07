/**
 * @jest-environment node
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.status(200).send('hello world')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if (!request.url.searchParams.has('mock')) {
    return
  }

  request.respondWith({
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
    body: 'hello world',
  })
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
  await httpServer.listen()

  interceptor.apply()
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
    test(`reads the response body encoded with ${encoding}`, (done) => {
      const req = http.get(httpServer.http.url('/resource'))

      req.on('response', async (res) => {
        res.setEncoding(encoding)
        const text = await readIncomingMessage(res)
        expect(text).toEqual(encode('hello world', encoding))

        done()
      })
    })
  })
})

describe('given the mocked response', () => {
  encodings.forEach((encoding) => {
    test(`reads the response body encoded with ${encoding}`, (done) => {
      const req = http.get(httpServer.http.url('/resource?mock=true'))

      req.on('response', async (res) => {
        res.setEncoding(encoding)
        const text = await readIncomingMessage(res)
        expect(text).toEqual(encode('hello world', encoding))

        done()
      })
    })
  })
})
