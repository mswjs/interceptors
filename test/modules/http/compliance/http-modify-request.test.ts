// @vitest-environment node
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('allows modifying the request headers for a request without a body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.get(server.http.url('/user'))
  const [response] = await toWebResponse(request)

  expect(Object.fromEntries(response.headers)).toMatchObject({
    connection: 'keep-alive',
    'x-appended-header': 'modified',
  })
})

it('allows modifying the request headers for a request with a body', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.set('x-appended-header', 'modified')
  })

  const request = http.request(server.http.url('/user'), { method: 'POST' })
  request.write('post-payload')
  request.end()

  const [response] = await toWebResponse(request)

  expect(response.headers.get('x-appended-header')).toBe('modified')
})
