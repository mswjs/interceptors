import { Readable } from 'node:stream'
import { setTimeout } from 'node:timers/promises'
import { TestProject } from 'vitest/node'
import { HttpServer } from '@open-draft/test-server/http'
import { useCors } from './test/helpers'

const server = new HttpServer((app) => {
  app.use(useCors)

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

  app.get('/network-error', (req, res) => {
    res.destroy()
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
