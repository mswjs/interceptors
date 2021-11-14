/**
 * @jest-environment jsdom
 */
import rateLimit from 'express-rate-limit'
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
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
    app.get('/', (_req, res) => {
      res.send('original-body')
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

test('does not reach the rate limit performing more mocked requests than allowed', async () => {
  const requests: Promise<XMLHttpRequest>[] = []

  for (let i = 0; i < 100; i++) {
    requests.push(
      createXMLHttpRequest((req) => {
        req.open('GET', httpServer.http.makeUrl('/?mock=true'))
        req.send()
      })
    )
  }

  const responses = await Promise.all(requests)
  const statusCodes = responses.map((res) => res.status)
  expect(statusCodes).not.toEqual(expect.arrayContaining([429]))
  expect(handleLimitReached).not.toHaveBeenCalled()
})
