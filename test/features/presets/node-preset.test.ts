// @vitest-environment jsdom
import http from 'node:http'
import { BatchInterceptor } from '../../../lib/node/index.mjs'
import nodeInterceptors from '../../../lib/node/presets/node.mjs'
import { toWebResponse, waitForXMLHttpRequest } from '#/test/helpers'

const interceptor = new BatchInterceptor({
  name: 'node-preset-interceptor',
  interceptors: nodeInterceptors,
})

const requestListener = vi.fn()

beforeAll(() => {
  interceptor.apply()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request)
    controller.respondWith(new Response('mocked'))
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
  const [response] = await toWebResponse(request)

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'http://localhost:3001/resource',
    })
  )

  // The listener must send back a mocked response.
  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('mocked')
})

it('intercepts and mocks an XMLHttpRequest (jsdom)', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', 'http://localhost:3001/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'http://localhost:3001/resource',
    })
  )

  expect(request.status).toBe(200)
  expect(request.responseText).toBe('mocked')
})

it('intercepts and mocks a fetch request', async () => {
  const response = await fetch('http://localhost:3001/resource')

  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'http://localhost:3001/resource',
    })
  )

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
})
