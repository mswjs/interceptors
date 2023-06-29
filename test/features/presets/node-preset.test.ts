// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { BatchInterceptor } from '../../../lib/node'
import nodeInterceptors from '../../../lib/node/presets/node'
import { createXMLHttpRequest, waitForClientRequest } from '../../helpers'

const interceptor = new BatchInterceptor({
  name: 'node-preset-interceptor',
  interceptors: nodeInterceptors,
})

const requestListener = vi.fn()

beforeAll(() => {
  interceptor.apply()
  interceptor.on('request', ({ request }) => {
    requestListener(request)
    request.respondWith(new Response('mocked'))
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts and mocks a ClientRequest', async () => {
  const request = http.get('http://localhost:3001/resource')
  const { res, text } = await waitForClientRequest(request)

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'http://localhost:3001/resource',
    })
  )

  // The listener must send back a mocked response.
  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('mocked')
})

it('intercepts and mocks an XMLHttpRequest (jsdom)', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', 'http://localhost:3001/resource')
    request.send()
  })

  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'http://localhost:3001/resource',
    })
  )

  expect(request.status).toBe(200)
  expect(request.responseText).toBe('mocked')
})
