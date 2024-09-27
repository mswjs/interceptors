// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import { vi, beforeAll, afterEach, afterAll, it, expect } from 'vitest'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { RequestAbortError } from '../../../../src/RequestController'

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

it('aborts an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.abort()
  })

  const request = http.get('http://localhost/irrelevant')
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  const responseListener = vi.fn()
  request.on('error', errorListener)
  request.on('close', closeListener)
  request.on('response', responseListener)

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalled()
  })

  expect(request.destroyed).toBe(true)
  expect(errorListener).toHaveBeenLastCalledWith(new RequestAbortError())
  expect(closeListener).toHaveBeenCalledOnce()
  expect(responseListener).not.toHaveBeenCalled()
})

it('aborts an HTTP request with a custom reason', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.abort('abort reason')
  })

  const request = http.get('http://localhost/irrelevant')
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  const responseListener = vi.fn()
  request.on('error', errorListener)
  request.on('close', closeListener)
  request.on('response', responseListener)

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalled()
  })

  expect(request.destroyed).toBe(true)
  expect(errorListener).toHaveBeenLastCalledWith(
    new RequestAbortError('abort reason')
  )
  expect(closeListener).toHaveBeenCalledOnce()
  expect(responseListener).not.toHaveBeenCalled()
})

it('aborts an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.abort()
  })

  const request = https.get('https://localhost/irrelevant')
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  const responseListener = vi.fn()
  request.on('error', errorListener)
  request.on('close', closeListener)
  request.on('response', responseListener)

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalled()
  })

  expect(request.destroyed).toBe(true)
  expect(errorListener).toHaveBeenLastCalledWith(new RequestAbortError())
  expect(closeListener).toHaveBeenCalledOnce()
  expect(responseListener).not.toHaveBeenCalled()
})

it('aborts an HTTPs request from the interceptor', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.abort('abort reason')
  })

  const request = https.get('https://localhost/irrelevant')
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  const responseListener = vi.fn()
  request.on('error', errorListener)
  request.on('close', closeListener)
  request.on('response', responseListener)

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalled()
  })

  expect(request.destroyed).toBe(true)
  expect(errorListener).toHaveBeenLastCalledWith(
    new RequestAbortError('abort reason')
  )
  expect(closeListener).toHaveBeenCalledOnce()
  expect(responseListener).not.toHaveBeenCalled()
})
