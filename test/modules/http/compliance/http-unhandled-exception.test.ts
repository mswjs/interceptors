/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

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

it('handles a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const request = http.get('http://localhost/resource')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(await text()).toBe('hello world')
})

it('treats unhandled interceptor errors as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error')
  })

  const request = http.get('http://localhost/resource')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(500)
  expect(res.statusMessage).toBe('Unhandled Exception')
  expect(JSON.parse(await text())).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('performs request as-is if "unhandledException" listener is provided but does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  const request = http.get('http://localhost/resource')

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  // Must emit the "unhandledException" interceptor event.
  await vi.waitFor(() => {
    expect(unhandledExceptionListener).toHaveBeenCalledWith(
      expect.objectContaining({
        error: new Error('Custom error'),
      })
    )
  })

  // Since the interceptor didn't handle the exception,
  // it got swallowed. The request will continue as-is,
  // and since it requests non-existing resource, it will error.
  expect(requestErrorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ECONNREFUSED',
      address: '::1',
      port: 80,
    })
  )
})

it('handles exceptions as instructed in "unhandledException" listener (mock response)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { request, controller } = args
    unhandledExceptionListener(args)

    // Handle exceptions as a fallback 200 OK response.
    controller.respondWith(new Response('fallback response'))
  })

  const request = http.get('http://localhost/resource')

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(await text()).toBe('fallback response')

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(requestErrorListener).not.toHaveBeenCalled()
})

it('handles exceptions as instructed in "unhandledException" listener (request error)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { request, controller } = args
    unhandledExceptionListener(args)

    // Handle exceptions as request errors.
    controller.errorWith(new Error('Fallback error'))
  })

  const request = http.get('http://localhost/resource')

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  await vi.waitFor(() => {
    expect(requestErrorListener).toHaveBeenNthCalledWith(
      1,
      new Error('Fallback error')
    )
  })
  expect(request.destroyed).toBe(true)

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
})
