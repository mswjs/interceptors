import * as http from 'http'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { httpGet } from '../helpers'

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  async resolver() {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 201,
          statusText: 'Yohoho!',
        })
      }, 50)
    })
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('does not establish a socket connection for a mocked response', async () => {
  await expect(httpGet('http://localhost:9876')).resolves.toBeDefined()
})
