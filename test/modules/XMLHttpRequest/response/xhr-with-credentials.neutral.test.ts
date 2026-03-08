// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'
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

it('sets "credentials" to "same-origin" for the request that does not have "withCredentials" set', async () => {
  const pendingRequestFromRequestListener = Promise.withResolvers<Request>()
  interceptor.on('request', ({ request, controller }) => {
    pendingRequestFromRequestListener.resolve(request)

    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
      })
    )
  })

  const pendingRequestFromResponseListener = Promise.withResolvers<Request>()
  interceptor.on('response', ({ request }) => {
    pendingRequestFromResponseListener.resolve(request)
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')

  {
    const request = await pendingRequestFromRequestListener.promise
    expect(request.credentials).toBe('same-origin')
  }

  {
    const request = await pendingRequestFromResponseListener.promise
    expect(request.credentials).toBe('same-origin')
  }
})

it('sets "credentials" to "include" for the request that has "withCredentials" set to true', async () => {
  const pendingRequestFromRequestListener = Promise.withResolvers<Request>()
  interceptor.on('request', ({ request, controller }) => {
    pendingRequestFromRequestListener.resolve(request)

    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
      })
    )
  })

  const pendingRequestFromResponseListener = Promise.withResolvers<Request>()
  interceptor.on('response', ({ request }) => {
    pendingRequestFromResponseListener.resolve(request)
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.withCredentials = true
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')

  {
    const request = await pendingRequestFromRequestListener.promise
    expect(request.credentials).toBe('include')
  }

  {
    const request = await pendingRequestFromResponseListener.promise
    expect(request.credentials).toBe('include')
  }
})

it('sets "credentials" to "same-origin" for the request that has "withCredentials" set to false', async () => {
  const pendingRequestFromRequestListener = Promise.withResolvers<Request>()
  interceptor.on('request', ({ request, controller }) => {
    pendingRequestFromRequestListener.resolve(request)

    controller.respondWith(
      new Response('hello world', {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
      })
    )
  })

  const pendingRequestFromResponseListener = Promise.withResolvers<Request>()
  interceptor.on('response', ({ request }) => {
    pendingRequestFromResponseListener.resolve(request)
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.withCredentials = false
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('hello world')

  {
    const request = await pendingRequestFromRequestListener.promise
    expect(request.credentials).toBe('same-origin')
  }

  {
    const request = await pendingRequestFromResponseListener.promise
    expect(request.credentials).toBe('same-origin')
  }
})
