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

it('reads the mocked json response as json if "responseType" is set to "json"', async () => {
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
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toEqual(json)
})

it('reads the empty mocked response as null if "responseType" is set to "json"', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: { 'access-control-allow-origin': '*' },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBeNull()
})

it('reads the mocked text response as json if "responseType" is set to "json"', async () => {
  const json = { greeting: 'hello world' }

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(JSON.stringify(json), {
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/json',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toEqual(json)
})

it('reads the mocked ArrayBuffer response as json if "responseType" is set to "json"', async () => {
  const json = { greeting: 'hello world' }

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(new TextEncoder().encode(JSON.stringify(json)), {
        headers: { 'access-control-allow-origin': '*' },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toEqual(json)
})

it('reads the mocked blob response as json if "responseType" is set to "json"', async () => {
  const json = { greeting: 'hello world' }

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new Blob([JSON.stringify(json)], { type: 'application/json' }),
        {
          headers: { 'access-control-allow-origin': '*' },
        }
      )
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toEqual(json)
})
