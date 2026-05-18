// @vitest-environment node
/**
 * Using BatchInterceptor with both HttpRequestInterceptor and FetchInterceptor
 * causes the "connection" event listener to be added twice, resulting in
 * "Invariant Violation: CANNOT HANDLE ALREADY HANDLED REQUEST".
 */
import { BatchInterceptor } from '#/src/BatchInterceptor'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { FetchInterceptor } from '#/src/interceptors/fetch/node'

const interceptor = new BatchInterceptor({
  name: 'batch-test',
  interceptors: [new HttpRequestInterceptor(), new FetchInterceptor()],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('does not attach multiple "connection" listeners for nested interceptors', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const response = await fetch('http://localhost/resource')
  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
})
