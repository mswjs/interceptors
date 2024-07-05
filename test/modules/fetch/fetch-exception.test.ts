// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { FetchInterceptor } from '../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => void 0)
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  vi.restoreAllMocks()
  interceptor.dispose()
})

it('treats middleware exceptions as 500 responses', async () => {
  interceptor.on('request', () => {
    throw new Error('Network error')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  expect(await response.json()).toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})

it('treats a thrown Response as a mocked response', async () => {
  interceptor.on('request', () => {
    throw new Response('hello world')
  })

  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('hello world')
})

it('treats a Response.error() as a network error', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('TypeError')
  expect(requestError.message).toBe('Failed to fetch')
  expect(requestError.cause).toBeInstanceOf(Response)
})

it('treats a thrown Response.error() as a network error', async () => {
  interceptor.on('request', () => {
    throw Response.error()
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('TypeError')
  expect(requestError.message).toBe('Failed to fetch')
  expect(requestError.cause).toBeInstanceOf(Response)
})

it('handles exceptions by default if "unhandledException" is provided but does nothing', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', unhandledExceptionListener)

  const response = await fetch('http://localhost/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  expect(await response.json()).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
  expect(unhandledExceptionListener).toHaveBeenCalledOnce()
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

  const response = await fetch('http://localhost/resource')

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('fallback response')

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
})

it('handles exceptions as instructed in "unhandledException" listener (request error)', async () => {
  const unhandledExceptionListener = vi.fn()

  interceptor.on('request', () => {
    throw new Error('Custom error')
  })
  interceptor.on('unhandledException', (args) => {
    const { controller } = args
    unhandledExceptionListener(args)

    // Handle exceptions as a request error.
    controller.errorWith(new Error('Fallback error'))
  })

  const requestError = await fetch('http://localhost:3001/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<Error & { cause?: unknown }>((error) => error)

  expect(requestError.name).toBe('Error')
  expect(requestError.message).toBe('Fallback error')
  expect(requestError.cause).toBeUndefined()

  expect(unhandledExceptionListener).toHaveBeenCalledWith(
    expect.objectContaining({
      error: new Error('Custom error'),
    })
  )
})
