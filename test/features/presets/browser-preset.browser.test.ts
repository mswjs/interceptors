import { BatchInterceptor } from '@mswjs/interceptors'
import browserInterceptors from '@mswjs/interceptors/presets/browser'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const interceptor = new BatchInterceptor({
  name: 'browser',
  interceptors: browserInterceptors,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts and mocks a fetch request', async () => {
  const requestPromise = Promise.withResolvers<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response('mocked'))
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')

  const request = await requestPromise.promise

  expect(request.method).toBe('GET')
  expect(request.url).toBe('http://localhost:3001/resource')
  expect(request.body).toBeNull()
})

it('intercepts and mocks an XMLHttpRequest', async () => {
  const requestPromise = Promise.withResolvers<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response('mocked'))
  })

  const xhr = new XMLHttpRequest()
  xhr.open('GET', 'http://localhost:3001/resource')
  xhr.send()

  await waitForXMLHttpRequest(xhr)

  expect(xhr.status).toBe(200)
  expect(xhr.response).toBe('mocked')

  const request = await requestPromise.promise

  expect(request.method).toBe('GET')
  expect(request.url).toBe('http://localhost:3001/resource')
})
