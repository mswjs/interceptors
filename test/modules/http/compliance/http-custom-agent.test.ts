// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../../test/helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => res.send('hello world'))
})

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

it('preserves the context of the "createConnection" function in a custom http agent', async () => {
  const createConnectionContextSpy = vi.fn()
  class CustomHttpAgent extends http.Agent {
    createConnection(options: any, callback: any) {
      createConnectionContextSpy(this)
      return super.createConnection(options, callback)
    }
  }
  const agent = new CustomHttpAgent()

  const request = http.get(httpServer.http.url('/resource'), { agent })
  await waitForClientRequest(request)

  const [context] = createConnectionContextSpy.mock.calls[0] || []
  expect(context.constructor.name).toBe('CustomHttpAgent')
})

it('preserves the context of the "createConnection" function in a custom https agent', async () => {
  const createConnectionContextSpy = vi.fn()
  class CustomHttpsAgent extends https.Agent {
    createConnection(options: any, callback: any) {
      createConnectionContextSpy(this)
      return super.createConnection(options, callback)
    }
  }
  const agent = new CustomHttpsAgent()

  const request = https.get(httpServer.https.url('/resource'), {
    agent,
    rejectUnauthorized: false,
  })
  await waitForClientRequest(request)

  const [context] = createConnectionContextSpy.mock.calls[0]
  expect(context.constructor.name).toBe('CustomHttpsAgent')
})
