/**
 * @jest-environment node
 */
import * as http from 'http'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(event) {
    const { request } = event

    if (!request.url.searchParams.has('mock')) {
      return
    }

    event.respondWith({
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: 'hello world',
    })
  },
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
  httpServer = await createServer((app) => {
    app.get('/resource', (req, res) => {
      res.status(200).send('hello world')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  await httpServer.close()
  interceptor.restore()
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
      const req = http.get(httpServer.http.makeUrl('/resource'))

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
      const req = http.get(httpServer.http.makeUrl('/resource?mock=true'))

      req.on('response', async (res) => {
        res.setEncoding(encoding)
        const text = await readIncomingMessage(res)
        expect(text).toEqual(encode('hello world', encoding))

        done()
      })
    })
  })
})
