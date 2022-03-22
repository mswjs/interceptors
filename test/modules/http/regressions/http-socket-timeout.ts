/**
 * @note This test is intentionally omitted in the test run.
 * It's meant to be spawned in a child process by the actual test
 * that asserts that this one doesn't leave the Jest runner hanging
 * due to the unterminated socket.
 */
import * as http from 'http'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src/createInterceptor'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'

jest.setTimeout(5000)

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(event) {
    event.respondWith({
      status: 301,
      body: 'Hello world',
    })
  },
})

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/resource', (_req, res) => {
      res.status(500).send('must-not-reach-server')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('supports custom socket timeout on the HTTP request', (done) => {
  const req = http.request(httpServer.http.makeUrl('/resource'), (res) => {
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
