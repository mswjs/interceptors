// @vitest-environment node
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

it('handles exceptions by default if "unhandledException" listener is provided but does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  const request = http.get('http://localhost/resource')

  const requestErrorListener = vi.fn()
  request.on('error', requestErrorListener)

  const { res, text } = await waitForClientRequest(request)

  // Must emit the "unhandledException" interceptor event.
  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()

  // Since the "unhandledException" listener didn't handle the
  // exception, it will be translated to the 500 error response
  // (the default behavior).
  expect(res.statusCode).toBe(500)
  expect(res.statusMessage).toBe('Unhandled Exception')
  expect(JSON.parse(await text())).toEqual({
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
    const { controller } = args
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
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()
  expect(requestErrorListener).not.toHaveBeenCalled()
})

it('handles exceptions as instructed in "unhandledException" listener (request error)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { controller } = args
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
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()
})
