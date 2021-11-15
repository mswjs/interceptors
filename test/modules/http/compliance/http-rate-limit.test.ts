import * as http from 'http'
import rateLimit from 'express-rate-limit'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(req) {
    if (!req.url.searchParams.has('mock')) {
      return
    }

    return {
      status: 403,
      statusText: 'Forbidden',
      body: 'mocked-body',
    }
  },
})

const handleLimitReached = jest.fn()

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.use(
      rateLimit({
        max: 5,
        windowMs: 100,
        onLimitReached: handleLimitReached,
      })
    )

    app.get('/', (req, res) => {
      res.send('ok')
    })
  })

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('does not reach the rate limit preforming more mocked requests than allowed', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform more requests than allowed by rate limiting.
  for (let i = 0; i < 100; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.makeUrl('/?mock=true'))
        req.on('abort', reject)
        req.on('error', reject)
        req.on('response', resolve)
      })
    )
  }

  const responses = await Promise.all(requests)
  const statusCodes = responses.map((res) => res.statusCode)

  expect(statusCodes).not.toEqual(expect.arrayContaining([429]))
  expect(handleLimitReached).not.toHaveBeenCalled()
})

test('does not reach the rate limit performing allowed number of bypassed requests', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform allowed number of requests according to rate limiting.
  for (let i = 0; i < 5; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.makeUrl('/'))
        req.on('abort', reject)
        req.on('error', reject)
        req.on('response', resolve)
      })
    )
  }

  const responses = await Promise.all(requests)
  const statusCodes = responses.map((res) => res.statusCode)

  expect(statusCodes).not.toEqual(expect.arrayContaining([429]))
  expect(handleLimitReached).not.toHaveBeenCalled()
})
