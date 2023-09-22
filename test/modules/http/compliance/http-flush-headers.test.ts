import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { IncomingHttpHeaders } from 'http'
import { HttpRequestEventMap } from '../../../../lib/node'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/forward-header', (req, res) => {
    res.json({ foo: req.headers.foo })
  })

  app.post('/dump-body', (req, res) => {
    req.socket.once('data', (chunk) => {
      res.end('hello from server')
    })

    req.pause()
    req.on('data', () => {})

    res.setHeader('foo', req.headers.foo || 'NOT_SENT')
    res.flushHeaders()
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('flushes request headers on ".flushHeaders()" call', async () => {
  const req = http.request(httpServer.http.url('/forward-header'))
  req.setHeader('foo', 'bar')
  req.flushHeaders()

  const { res, text } = await waitForClientRequest(req)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe(`{"foo":"bar"}`)
})

it.only('', async () => {
  const requestListener = vi.fn<HttpRequestEventMap['request']>()

  interceptor.once('request', requestListener)

  const responsePromise = new DeferredPromise<{
    headers: IncomingHttpHeaders
    text: string
  }>()

  const req = http.request(httpServer.http.url('/dump-body'), {
    method: 'POST',
  })

  req.setHeader('foo', 'bar')
  req.flushHeaders()

  req.on('error', (error) => {
    responsePromise.reject(error)
  })

  req.on('response', (res) => {
    req.write('hello')
    req.write('from')
    req.write('client')
    req.end()

    res.resume()

    const responseChunks: Array<Buffer> = []

    res.on('data', (chunk) => {
      responseChunks.push(chunk)
    })

    res.on('end', () => {
      const responseBuffer = Buffer.concat(responseChunks)
      const responseText = responseBuffer.toString('utf8')

      responsePromise.resolve({
        headers: res.headers,
        text: responseText,
      })
    })
    res.on('error', (error) => {
      responsePromise.reject(error)
    })
  })

  const { headers, text } = await responsePromise
  expect(headers).toContain({ foo: 'bar' })
  expect(text).toBe('hello from server')

  expect(requestListener).toHaveBeenCalledTimes(1)
  const [{ request }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.http.url('/dump-body'))
  expect(request.headers.get('foo')).toBe('bar')
  expect(await request.text()).toBe('hellofromclient')
})
