import * as http from 'http'
import rateLimit from 'express-rate-limit'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.use(
    rateLimit({
      max: 5,
      windowMs: 100,
      onLimitReached() {
        console.warn('RATE LIMIT REACHED!')
        handleLimitReached()
      },
    })
  )

  app.get('/', (req, res) => {
    res.send('ok')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if (!request.url.searchParams.has('mock')) {
    return
  }

  request.respondWith({
    status: 403,
    statusText: 'Forbidden',
    body: 'mocked-body',
  })
})

const handleLimitReached = jest.fn()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('does not reach the rate preforming more mocked requests than allowed', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform more requests than allowed by rate limiting.
  for (let i = 0; i < 100; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.url('/?mock=true'))
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

test('does not reach the rate limiting performing allowed number of bypassed requests', async () => {
  const requests: Promise<http.IncomingMessage>[] = []

  // Perform allowed number of requests according to rate limiting.
  for (let i = 0; i < 5; i++) {
    requests.push(
      new Promise((resolve, reject) => {
        const req = http.get(httpServer.http.url('/'))
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
