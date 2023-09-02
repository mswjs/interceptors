// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'
import type { HttpRequestEventMap } from '../../../../src'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/:statusCode', (req, res) =>
    res.status(+req.params.statusCode).end()
  )
})

const interceptor = new XMLHttpRequestInterceptor()

const responseListener = vi.fn<HttpRequestEventMap['response']>()
interceptor.on('response', responseListener)

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

it('represents a 204 response without body using fetch api response', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', httpServer.http.url('/204'))
    request.send()
  })

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      response: expect.objectContaining({
        status: 204,
        body: null,
      } satisfies Partial<Response>),
    })
  )
  expect(responseListener).toHaveBeenCalledTimes(1)
})

it('represents a 205 response without body using fetch api response', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', httpServer.http.url('/205'))
    request.send()
  })

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      response: expect.objectContaining({
        status: 205,
        body: null,
      } satisfies Partial<Response>),
    })
  )
  expect(responseListener).toHaveBeenCalledTimes(1)
})

it('represents a 304 response without body using fetch api response', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', httpServer.http.url('/304'))
    request.send()
  })

  expect(request.response).toBe('')
  expect(responseListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      response: expect.objectContaining({
        status: 304,
        body: null,
      } satisfies Partial<Response>),
    })
  )
  expect(responseListener).toHaveBeenCalledTimes(1)
})
