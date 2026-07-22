// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/msw/issues/355
 */
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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

it('XMLHttpRequest: treats unhandled interceptor exceptions as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://localhost/api')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('axios: unhandled interceptor exceptions are treated as 500 responses', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    throw new Error('Custom error')
  })

  const error = await axios.get('https://test.mswjs.io').catch((error) => error)

  /**
   * axios always treats request exceptions with the fixed "Network Error" message.
   * @see https://github.com/axios/axios/issues/383
   */
  expect(error).toHaveProperty('message', 'Request failed with status code 500')
  expect(error.response.status).toBe(500)
  expect(error.response.statusText).toBe('Unhandled Exception')
  expect(error.response.data).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('treats a thrown Response instance as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://localhost/api')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(200)
  expect(request.response).toBe('hello world')
  expect(request.responseText).toBe('hello world')
})

it('treats a Response.error() as a network error', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const requestErrorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://localhost/api')
  request.addEventListener('error', requestErrorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(0)
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})

it('treats a thrown Response.error() as a network error', async () => {
  interceptor.on('request', () => {
    throw Response.error()
  })

  const requestErrorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://localhost/api')
  request.addEventListener('error', requestErrorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(0)
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})

it('handles exceptions by default if "unhandledException" listener is provided but does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://localhost/api')
  request.send()

  await waitForXMLHttpRequest(request)

  // Must emit the "unhandledException" interceptor event.
  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('handles exceptions as instructed in "unhandledException" listener (mock response)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    unhandledExceptionListener(args)

    // Handle exceptions as a fallback 200 OK response.
    args.controller.respondWith(new Response('fallback response'))
  })

  const requestErrorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://localhost/api')
  request.addEventListener('error', requestErrorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('fallback response')

  expect.soft(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect.soft(unhandledExceptionListener).toHaveBeenCalledOnce()
  expect.soft(requestErrorListener).not.toHaveBeenCalled()
})

it('handles exceptions as instructed in "unhandledException" listener (request error)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    }

    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    unhandledExceptionListener(args)

    // Handle exceptions as request errors.
    args.controller.errorWith(new Error('Fallback error'))
  })

  const requestErrorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.responseType = 'text'
  request.open('GET', 'http://localhost/api')
  request.addEventListener('error', requestErrorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect(requestErrorListener).toHaveBeenCalledOnce()
  expect(request.readyState).toBe(4)

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()
})
