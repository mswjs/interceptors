// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/user', (_req, res) => {
    res.header('access-control-allow-origin', '*')
    res.header('content-type', 'plain/text')
    res.send('hello world')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles original response without any headers', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', httpServer.http.url('/user'))
    request.setRequestHeader('accept', 'plain/text')
    request.send()
  })

  expect(request.status).toEqual(200)
  expect(request.statusText).toEqual('OK')
  expect(request.responseText).toEqual('hello world')
  /**
   * @note Having an XHR response with no headers is virtually impossible
   * due to the CORS and preflight requests policies.
   */
  expect(request.getAllResponseHeaders()).toEqual(
    ['content-type: plain/text; charset=utf-8', 'content-length: 11'].join(
      '\r\n'
    )
  )
})
