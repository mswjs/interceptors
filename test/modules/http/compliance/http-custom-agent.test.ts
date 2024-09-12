/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import type { Socket } from 'node:net'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index'
import { waitForClientRequest } from '../../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('original')
  })
})

const interceptor = new ClientRequestInterceptor()

const createAgent = (BaseClass: http.Agent | https.Agent) => {
  // @ts-expect-error T2507
  class CustomAgent extends BaseClass {
    mockFunction: Mock;

    constructor () {
      super()
      this.mockFunction = vi.fn()
    }

    createConnection (options: any, callback: any): Socket {
      const result = super.createConnection(options, callback)
      this.mockFunction()
      return result
    }
  }
  return new CustomAgent()
}

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

it('binds the custom agent context for an http createConnection', async () => {
  const agent = createAgent(http.Agent)
  const httpUrl = httpServer.http.url('/')
  const options = {
    agent,
  }
  const request = http.get(httpUrl, options)

  await waitForClientRequest(request)

  expect(agent.mockFunction).toHaveBeenCalledTimes(1)
})

it('binds the custom agent context for an https createConnection', async () => {
  const agent = createAgent(https.Agent)
  const httpUrl = httpServer.https.url('/')
  const options = {
    agent,
    rejectUnauthorized: false,
  }
  const request = https.get(httpUrl, options)

  await waitForClientRequest(request)

  expect(agent.mockFunction).toHaveBeenCalledTimes(1)
})
