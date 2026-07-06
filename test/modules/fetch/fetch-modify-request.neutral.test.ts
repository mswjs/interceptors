import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports modifying outgoing request headers', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  // The test server echoes the request headers in the response.
  const response = await fetch(server.http.url('/user'))

  expect(response.status).toBe(200)
  expect(response.headers.get('x-appended-header')).toBe('modified')
})
