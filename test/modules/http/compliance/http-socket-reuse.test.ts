/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'
import { MockHttpSocket } from '../../../../src/interceptors/ClientRequest/MockHttpSocket'

const httpServer = new HttpServer((app) => {
  app.get('/resource', async (req, res) => {
    await sleep(200)
    res.status(500).end()
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

it.only('allows reusing the same socket for handled requests', async () => {
  interceptor.on('request', ({ request }) => {
    const url = new URL(request.url)
    request.respondWith(new Response(url.pathname))
  })

  const agent = new http.Agent({
    // Reuse existing sockets for multiple requests.
    keepAlive: true,
  })

  const requestOne = http.get('http://localhost/cats', {
    agent,
  })
  expect(requestOne.shouldKeepAlive).toBe(true)

  // Must add the MockHttpSocket to the active sockets.
  const [socket] = agent.sockets['localhost:80:'] || []
  expect(agent.sockets).toEqual({
    'localhost:80:': [expect.any(MockHttpSocket)],
  })

  const requestOneResult = await waitForClientRequest(requestOne)
  expect(requestOneResult.res.statusCode).toBe(200)
  expect(await requestOneResult.text()).toBe('/cats')

  /**
   * Must match the ClientRequest state to keep the response socket alive.
   * @see https://github.com/nodejs/node/blob/29ec7e9331c4944006ffe28e126cc31cc3de271b/lib/_http_client.js#L764
   */
  expect(requestOne.writableFinished).toBe(true)
  // Destroyed and aborted are NOT the same in this context.
  expect(requestOne.aborted).toBe(false)

  const requestTwo = http.get('http://localhost/dogs', {
    agent,
  })

  expect(agent.sockets).toEqual({
    'localhost:80:': [socket],
  })

  const requestTwoResult = await waitForClientRequest(requestTwo)
  expect(requestTwoResult.res.statusCode).toBe(200)
  expect(await requestTwoResult.text()).toBe('/dogs')
})

it.todo(
  'respects "request.setSocketKeepAlive()" on a handled request',
  async () => {}
)
