// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('reads the mocked text response as-is if "responseType" is set to "text"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'text/plain',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')
})

it('reads the empty mocked text response as an empty string if "responseType" is set to "text"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: { 'access-control-allow-origin': '*' },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('')
})

it('reads the mocked json response as text if "responseType" is set to "text"', async () => {
  const json = { greeting: 'hello world' }

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      Response.json(json, {
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe(JSON.stringify(json))
})

it('reads the mocked ArrayBuffer response as text if "responseType" is set to "text"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(new TextEncoder().encode('hello world'), {
        headers: { 'access-control-allow-origin': '*' },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')
})

it('reads the mocked blob response as text if "responseType" is set to "text"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(new Blob(['hello world'], { type: 'text/plain' }), {
        headers: { 'access-control-allow-origin': '*' },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')
})
