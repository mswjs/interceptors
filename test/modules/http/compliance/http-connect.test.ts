import { afterAll, beforeAll, expect, it } from 'vitest'
import http from 'node:http'
import type { Socket } from 'node:net'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('', async () => {
  interceptor.on('request', ({ request }) => {
    // Handle the "CONNECT" request to the target host.
    if (request.method === 'CONNECT') {
      return request.respondWith(
        new Response(null, {
          status: 200,
          statusText: 'Connection Established',
        })
      )
    }

    const url = new URL(request.url)

    // Handle the request against the target.
    if (url.hostname === 'www.example.com') {
      console.log(request)
      return request.respondWith(new Response('Hello world'))
    }
  })

  const request = http.request('', {
    method: 'CONNECT',
    host: '127.0.0.1',
    port: 1234,
    /**
     * @note For "CONNECT" request methods,
     * the "path" option is expected to equal to
     * the next target (when proxying).
     */
    path: 'www.example.com:80',
  })
  request.end()

  const connectPromise = new DeferredPromise<
    [http.IncomingMessage, Socket, Buffer]
  >()

  request.on('connect', (response, socket, head) => {
    connectPromise.resolve([response, socket, head])
  })

  const [response, socket, head] = await connectPromise

  // IncomingMessage sent to the request's "connect" event
  // is the initial "CONNECT" response from the server.
  expect(response.statusCode).toBe(200)
  expect(response.statusMessage).toBe('Connection Established')

  // Must receive empty head since none was sent from the server.
  expect(head.byteLength).toBe(0)

  // Make additional requests against the target host.
  socket.write(
    [
      'GET /resource HTTP/1.1',
      'Host: www.example.com:80',
      'Connection:close',
      '',
    ].join('\r\n')
  )

  socket.on('data', (chunk) => {
    console.log('from server:', chunk.toString('utf8'))
  })
})
