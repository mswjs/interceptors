import axios from 'axios'
import { createInterceptor } from '../../src'
import nodeInterceptors from '../../src/presets/node'

const interceptor = createInterceptor({
  modules: nodeInterceptors,
  resolver(request) {
    if (request.url.pathname === '/user') {
      return {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-header': 'yes',
        },
        body: JSON.stringify({
          mocked: true,
        }),
      }
    }
  },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.restore()
})

test('responds with a mocked response to an "axios()" request', async () => {
  const res = await axios('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

test('responds with a mocked response to an "axios.get()" request', async () => {
  const res = await axios.get('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

test('responds with a mocked response to an "axios.post()" request', async () => {
  const res = await axios.post('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})
