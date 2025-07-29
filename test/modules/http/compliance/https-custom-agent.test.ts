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
    agent: new https.Agent(),
    rejectUnauthorized: false,
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')
})

it('supports http.Agent instance as a custom agent for a passthrough request', async () => {
  const request = https.get(httpServer.https.url('/resource'), {
    /**
     * @note `http.Agent` instances are allowed as custom HTTPS agents.
     * In fact, `https.Agent` is a child of the `http.Agent` class.
     */
    agent: new http.Agent(),
  })

  const { text } = await waitForClientRequest(request)
  await expect(text()).resolves.toBe('original response')
})
