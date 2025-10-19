// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.send('original response')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports https.Agent instance as a custom agent for a mocked request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = https.get('https://localhost/irrelevant', {
    agent: new https.Agent(),
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('hello world')
})

it('supports https.Agent instance as a custom agent for a passthrough request', async () => {
  const request = https.get(httpServer.https.url('/resource'), {
    agent: new https.Agent({
      rejectUnauthorized: false,
    }),
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')
})

it('supports http.Agent instance as a custom agent for a passthrough request', async () => {
  /**
   * @note `http.Agent` instances are allowed as custom HTTPS agents.
   * In fact, `https.Agent` is a child of the `http.Agent` class.
   */
  class MyHttpAgent extends http.Agent {
    /**
     * @note `http.Agent` has an undocumented `protocol` property that is used
     * to invalidate requests made with an unmatching protocol.
     * @see https://github.com/nodejs/node/blob/cde8f275ad6ceecc4837fa8a64ba948b39d084b3/lib/https.js#L454
     */
    public readonly protocol = 'https:'

    createConnection(options: any, callback: any) {
      // Proxy the socket creation to the HTTPS socket so this custom class
      // can handle HTTPS requests properly.
      return https.globalAgent.createConnection(options, callback)
    }
  }

  const request = https.get(httpServer.https.url('/resource'), {
    agent: new MyHttpAgent(),
    rejectUnauthorized: false,
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')
})
