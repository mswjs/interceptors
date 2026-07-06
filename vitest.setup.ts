import { Readable } from 'node:stream'
import { setTimeout } from 'node:timers/promises'
import { TestProject } from 'vitest/node'
import * as express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { compressResponse, useCors } from './test/helpers'

type SupportedContentCoding = 'gzip' | 'x-gzip' | 'deflate' | 'br'

function isSupportedContentCoding(
  coding: string
): coding is SupportedContentCoding {
  return ['gzip', 'x-gzip', 'deflate', 'br'].includes(coding)
}

const server = new HttpServer((app) => {
  app.use(useCors)

  app.post('/status', express.text(), (req, res) => {
    res.writeHead(req.body).end()
  })

  app.get('/redirect', (req, res) => {
    const baseUrl = new URL(
      `${req.secure ? 'https' : 'http'}://${req.get('host')}/`
    )

    res
      .status(301)
      .set({ location: new URL('/redirect/destination', baseUrl) })
      .end()
  })
  app.get('/redirect/destination', (req, res) => {
    res.status(200).send('destination-body')
  })

  app.get('/stream', (req, res) => {
    const encoder = new TextEncoder()
    const pad = (value: string) => value + ' '.repeat(1024 - value.length)
    const chunks = [pad('hello'), pad(' '), pad('world')]

    res.status(200).set({
      'content-type': 'text/plain',
      'content-length': chunks.join('').length,
    })

    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()

        if (chunk) {
          await setTimeout(100)
          return controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      },
    })
    Readable.fromWeb(stream as any).pipe(res)
  })

  app.get('/compressed', (req, res) => {
    /**
     * @note Use a custom header to communicate the expected encoding
     * because "accept-encoding" is a forbidden browser header.
     */
    const contentEncoding = req.header('x-accept-encoding') || ''
    const codings = contentEncoding
      .split(',')
      .map((coding) => coding.trim())
      .filter(isSupportedContentCoding)

    res
      .set('content-encoding', contentEncoding)
      .end(compressResponse(codings, 'hello world'))
  })

  app.get('/switching-protocols', (req, res) => {
    res.writeHead(101, 'Switching Protocols', {
      connection: 'upgrade',
      upgrade: 'HTTP/2.0',
    })
    res.end()
  })

  app.get('/cacheable', (req, res) => {
    if (req.headers['if-none-match'] === '"etag-value"') {
      return res.status(304).end()
    }

    res.set('etag', '"etag-value"')
    res.set('cache-control', 'max-age=0, must-revalidate')
    res.status(200).send('original-response')
  })

  app.get('/server-error', (req, res) => {
    res.status(500).send('Internal Server Error')
  })
  app.get('/network-error', (req, res) => {
    res.destroy()
  })

  app.get('/delay', async (req, res) => {
    await setTimeout(150)
    res.send('original-response')
  })

  app.all('*', (req, res) => {
    res.status(200).set(req.headers)

    if (req.headers['set-cookie']) {
      res.cookie('cookie', 'supersecret', {
        secure: true,
        expires: new Date(Date.now() + 90000),
      })
    }

    if (res.getHeader('content-type') == null) {
      res.set('content-type', 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET') {
      res.send('original-response')
    } else {
      req.pipe(res)
    }
  })
})

export async function setup(project: TestProject) {
  await server.listen()

  project.provide('server', {
    http: server.http.address.href,
    https: server.https.address.href,
  })
}

export async function teardown() {
  await server.close()
}
