// @vitest-environment node
import { urlToHttpOptions } from 'node:url'
import http from 'node:http'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../../test/helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports `urlToHttpOptions()` as the ClientRequest options', async () => {
  const requestCallback = vi.fn<(request: Request) => void>()
  interceptor.on('request', ({ request, controller }) => {
    requestCallback(request)
    controller.respondWith(new Response('hello world'))
  })

  const request = http
    .request(urlToHttpOptions(new URL('http://localhost')))
    .end()
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  await expect(text()).resolves.toBe('hello world')

  expect(requestCallback).toHaveBeenCalledOnce()
  const [fetchRequest] = requestCallback.mock.calls[0]
  expect(fetchRequest.method).toBe('GET')
  expect(fetchRequest.url).toBe('http://localhost/')
})

it('supports augmented `urlToHttpOptions()` as the ClientRequest options', async () => {
  const requestCallback = vi.fn<(request: Request) => void>()
  interceptor.on('request', ({ request, controller }) => {
    requestCallback(request)
    controller.respondWith(new Response('hello world'))
  })

  const request = http
    .request({
      ...urlToHttpOptions(new URL('http://localhost')),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .end(JSON.stringify({ hello: 'world' }))
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  await expect(text()).resolves.toBe('hello world')

  expect(requestCallback).toHaveBeenCalledOnce()
  const [fetchRequest] = requestCallback.mock.calls[0]
  expect(fetchRequest.method).toBe('POST')
  expect(fetchRequest.url).toBe('http://localhost/')
  await expect(fetchRequest.json()).resolves.toEqual({ hello: 'world' })
})
