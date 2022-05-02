/**
 * @note This test is intentionally omitted in the test run.
 * It's meant to be spawned in a child process by the actual test
 * that asserts that this one doesn't leave the Jest runner hanging
 * due to the unterminated socket.
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

jest.setTimeout(5000)

const httpServer = new HttpServer((app) => {
  app.get('/resource', (_req, res) => {
    res.status(500).send('must-not-reach-server')
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  request.respondWith({
    status: 301,
    body: 'Hello world',
  })
})

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('supports custom socket timeout on the HTTP request', (done) => {
  const req = http.request(httpServer.http.url('/resource'), (res) => {
    res.on('data', () => null)
    res.on('end', () => {
      expect(res.statusCode).toEqual(301)
      done()
    })
  })

  // Intentionally large request timeout.
  req.setTimeout(10000)
  req.end()
})
