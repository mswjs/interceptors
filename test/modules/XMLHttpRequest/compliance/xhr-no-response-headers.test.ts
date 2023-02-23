// @vitest-environment jsdom
// Change the JSDOM origin URL to prevent "Cross origin forbidden" errors.
// @vitest-environment-options { "url": "http://127.0.0.1:55003" }
import { it, expect, beforeAll, afterAll } from 'vitest'
import { Server } from 'http'
import express from 'express'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

let httpServer: Server
const serevrUrl = new URL('http://127.0.0.1:55003')
const app = express()

app.use('/user', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  next()
})

app.get('/user', (_req, res) => {
  if (!res.socket) {
    throw new Error('Something is terribly wrong with the socket')
  }

  // Respond with a message that has no headers.
  res.socket.end(`HTTP/1.1 200 OK

hello world`)
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()

  await new Promise<void>((resolve) => {
    /**
     * @todo Replace this with a newer version of "test-serever" that
     * supports custom port/hostname. Note that the new version also
     * changes how the default middleware, like CORS, are applied.
     */
    httpServer = app.listen(+serevrUrl.port, serevrUrl.hostname, resolve)
  })
})

afterAll(async () => {
  interceptor.dispose()

  await new Promise<void>((resolve, reject) => {
    httpServer?.close((error) => {
      if (error) {
        return reject(error)
      }
      resolve()
    })
  })
})

it('handles an original response without any headers', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', new URL('/user', serevrUrl))
    request.setRequestHeader('Accept', 'plain/text')
    request.send()
  })

  expect(request.getAllResponseHeaders()).toEqual('')
  expect(request.status).toEqual(200)
  expect(request.statusText).toEqual('OK')
  expect(request.responseText).toEqual('hello world')
  expect(request.getAllResponseHeaders()).toEqual('')
})
