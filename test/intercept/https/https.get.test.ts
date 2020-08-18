/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsGet } from '../../helpers'

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []

beforeAll(() => {
  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(() => {
  requestInterceptor.restore()
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepare(
    httpsGet('https://httpbin.org/get?userId=123', {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual('https://httpbin.org/get?userId=123')
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('userId')).toEqual('123')

  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})
