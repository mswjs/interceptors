// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/msw/issues/355
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

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

  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost/api')
    request.send()
  })

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error',
    stack: expect.any(String),
  })
})

it('axios: unhandled interceptor exceptions are treated as 500 responses', async () => {
  interceptor.on('request', () => {
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

  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'text'
    request.open('GET', 'http://localhost/api')
    request.send()
  })

  expect(request.status).toBe(200)
  expect(request.response).toBe('hello world')
  expect(request.responseText).toBe('hello world')
})

it('treats a Response.error() as a network error', async () => {
  interceptor.on('request', ({ request }) => {
    request.respondWith(Response.error())
  })

  const requestErrorListener = vi.fn()
  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'text'
    request.open('GET', 'http://localhost/api')
    request.addEventListener('error', requestErrorListener)
    request.send()
  })

  expect(request.status).toBe(0)
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})

it('treats a thrown Response.error() as a network error', async () => {
  interceptor.on('request', () => {
    throw Response.error()
  })

  const requestErrorListener = vi.fn()
  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'text'
    request.open('GET', 'http://localhost/api')
    request.addEventListener('error', requestErrorListener)
    request.send()
  })

  expect(request.status).toBe(0)
  expect(requestErrorListener).toHaveBeenCalledTimes(1)
})
