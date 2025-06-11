/**
 * @vitest-environment node
 */
import http from 'node:http'
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'
import exp from 'node:constants';

const interceptor = new ClientRequestInterceptor()

const socketPath = tmpdir() + '/socket.sock'
const httpServer = new http.Server((req, res) => {
  res.end('hello world')
})

beforeAll(async () => {
  interceptor.apply()
  const serverListenPromise = new DeferredPromise<void>()
  httpServer.listen(socketPath, () => {
    serverListenPromise.resolve()
  })
  await serverListenPromise
})

afterAll(async () => {
  interceptor.dispose()
  const serverClosePromise = new DeferredPromise<void>()
  httpServer.close((error) => {
    if (error) {
      serverClosePromise.reject(error)
    }
    serverClosePromise.resolve()
  })
  await serverClosePromise
})

describe('Unix socket', () => {
  it('dispatches a GET request to a Unix socket', async () => {
    const request = http.get({
      socketPath,
      path: '/test-get',
    })

    const { text } = await waitForClientRequest(request)

    expect(await text()).toBe('hello world')
  })

  it('intercepts a GET request to a Unix socket', async () => {
    const requestListenerPromise = new DeferredPromise<string>()
    interceptor.on('request', ({ controller, request }) => {
      requestListenerPromise.resolve(request.url)
      controller.respondWith(new Response('hello world', { status: 200 }))
    })

    const request = http.get({
      socketPath,
      path: '/test-get',
    })

    const { text } = await waitForClientRequest(request)

    expect(await text()).toBe('hello world')
    await expect(requestListenerPromise).resolves.toStrictEqual('http://localhost/test-get')
  })
})