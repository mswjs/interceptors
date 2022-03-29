/**
 * @jest-environment jsdom
 * @see https://github.com/mswjs/interceptors/issues/7
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (_req, res) => {
      setTimeout(() => {
        res.send('ok')
      }, 50)
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('handles request timeout via the "ontimeout" callback', (done) => {
  createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'), true)
    req.timeout = 1
    req.ontimeout = function () {
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
    req.addEventListener('timeout', function () {
      expect(this.readyState).toBe(4)
      done()
    })
    req.send()
  })
})
