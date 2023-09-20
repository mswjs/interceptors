// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { createXMLHttpRequest, useCors } from '../../../helpers'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/account', (req, res) => {
    return res
      .status(200)
      .append('access-control-expose-headers', 'x-response-type')
      .append('x-response-type', 'bypass')
      .send()
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('ignores casing when retrieving response headers via "getResponseHeader"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/account'))
    req.send()
  })

  expect(req.getResponseHeader('x-response-type')).toEqual('bypass')
  expect(req.getResponseHeader('X-response-Type')).toEqual('bypass')
  expect(req.getResponseHeader('X-RESPONSE-TYPE')).toEqual('bypass')
})
