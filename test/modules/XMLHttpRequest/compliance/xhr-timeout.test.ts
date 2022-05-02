/**
 * @jest-environment jsdom
 * @see https://github.com/mswjs/interceptors/issues/7
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { sleep } from '../../../../test/helpers'
import { createXMLHttpRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', async (_req, res) => {
    await sleep(50)
    res.send('ok')
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('handles request timeout via the "ontimeout" callback', (done) => {
  createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'), true)
    req.timeout = 1
    req.ontimeout = function customTimeoutCallback() {
      expect(this.readyState).toBe(4)
      done()
    }
    req.send()
  })
})

test('handles request timeout via the "timeout" event listener', (done) => {
  createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'), true)
    req.timeout = 1
    req.addEventListener('timeout', function customTimeoutListener() {
      expect(this.readyState).toBe(4)
      done()
    })
    req.send()
  })
})
