/**
 * @see https://github.com/mswjs/interceptors/issues/904
 */
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

it('rejects for a request with an invalid header value', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await expect(
    fetch(server.http.url('/resource'), {
      headers: { 'x-invalid-header': 'a\nb' },
    })
  ).rejects.toBeInstanceOf(TypeError)
  expect(requestListener).not.toHaveBeenCalled()
})

it('rejects for a request with an invalid header name', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await expect(
    fetch(server.http.url('/resource'), {
      headers: { 'invalid header': 'value' },
    })
  ).rejects.toBeInstanceOf(TypeError)
  expect(requestListener).not.toHaveBeenCalled()
})

it('rejects for a request with an invalid URL', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await expect(fetch('http://')).rejects.toBeInstanceOf(TypeError)
  expect(requestListener).not.toHaveBeenCalled()
})

it('rejects for a GET request with a body', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await expect(
    fetch(server.http.url('/resource'), {
      method: 'GET',
      body: 'Hello server',
    })
  ).rejects.toBeInstanceOf(TypeError)
  expect(requestListener).not.toHaveBeenCalled()
})
