/**
 * @see https://github.com/mswjs/msw/issues/355
 */
import fetch from 'node-fetch'
import axios from 'axios'
import { createInterceptor } from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {
    throw new Error('Custom error message')
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
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
