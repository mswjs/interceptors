// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/msw/issues/355
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', () => {
  throw new Error('Custom error message')
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('XMLHttpRequest: treats unhandled interceptor exceptions as 500 responses', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost/api')
    request.send()
  })

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom error message',
    stack: expect.any(String),
  })
})

it('axios: unhandled interceptor exceptions are treated as 500 responses', async () => {
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
    message: 'Custom error message',
    stack: expect.any(String),
  })
})
