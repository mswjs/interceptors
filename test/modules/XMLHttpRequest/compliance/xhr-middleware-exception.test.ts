/**
 * @jest-environment jsdom
 * @see https://github.com/mswjs/msw/issues/355
 */
import fetch from 'node-fetch'
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  throw new Error('Custom error message')
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

test('propagates a custom error message to the fetch request error', () => {
  fetch('https://test.mswjs.io').catch((error) => {
    expect(error).toHaveProperty(
      'message',
      'request to https://test.mswjs.io/ failed, reason: Custom error message'
    )
  })
})

test('causes a Network Error when using axios', () => {
  axios.get('https://test.mswjs.io').catch((error) => {
    /**
     * axios always treats request exceptions with the fixed "Network Error" message.
     * @see https://github.com/axios/axios/issues/383
     */
    expect(error).toHaveProperty('message', 'Network Error')
  })
})
