// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'
import { httpResponseCodesWithNullBody } from '../../../../src/interceptors/XMLHttpRequest/XMLHttpRequestController'

const statuses = Object.keys(httpResponseCodesWithNullBody)

const httpServer = new HttpServer((app) => {
  app.use(useCors)

  statuses.forEach((status) => {
    app.get(`/get-${status}`, (req, res) => {
      res.status(Number(status)).send()
    })
  })
})

const resolver = vi.fn<HttpRequestEventMap['response']>()

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('response', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})


describe('XHR responses with empty body', () => {
  statuses.forEach((status) => {
    it(`${status} http status`, async () => {
      const url = httpServer.http.url(`/get-${status}`)

      await createXMLHttpRequest((req) => {
        req.open('GET', url)
        req.send()
      })

      expect(resolver).toHaveBeenCalledTimes(1)

      const [{ response }] = resolver.mock.calls[0]

      expect(response.body).toBe(null)
    })
  })
})

