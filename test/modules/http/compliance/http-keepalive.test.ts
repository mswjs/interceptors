// @vitest-environment node
import { vi, it, expect, afterAll, afterEach, beforeAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../..//helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
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

it('dispatches the "connect" socket event when reusing sockets ("keepAlive": true)', async () => {
  const connectListener = vi.fn()

  const agent = new http.Agent({
    keepAlive: true,
  })

  async function makeRequest() {
    const request = http.request(httpServer.http.url('/resource'), {
      method: 'GET',
      agent,
    })
    request.on('socket', (socket) => {
      socket.on('connect', connectListener)
    })
    request.end()
    await waitForClientRequest(request)
  }

  await Promise.all([makeRequest(), makeRequest(), makeRequest()])

  expect(connectListener).toHaveBeenCalledTimes(3)
})
