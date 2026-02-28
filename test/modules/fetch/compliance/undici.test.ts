// @vitest-environment node
import { fetch, request } from 'undici'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'

const interceptor = new HttpRequestInterceptor()
beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('mocks an HTTP request made with "fetch"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await fetch('http://any.host.here/api')

  expect.soft(response.status).toBe(200)
  expect.soft(Object.fromEntries(response.headers)).toEqual({
    'x-custom-header': 'yes',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})

it('mocks an HTTPS request made with "fetch"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await fetch('https://any.host.here/api')

  expect.soft(response.status).toBe(200)
  expect.soft(Object.fromEntries(response.headers)).toEqual({
    'x-custom-header': 'yes',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})

it('mocks an HTTP request made with "request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await request('http://any.host.here/api')

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.headers).toEqual({ 'x-custom-header': 'yes' })
  await expect.soft(response.body.text()).resolves.toBe('hello world')
})

it('mocks an HTTPS request made with "request"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const response = await request('https://any.host.here/api')

  expect.soft(response.statusCode).toBe(200)
  expect.soft(response.headers).toEqual({ 'x-custom-header': 'yes' })
  await expect.soft(response.body.text()).resolves.toBe('hello world')
})
