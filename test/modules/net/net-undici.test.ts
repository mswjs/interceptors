// @vitest-environment node
import { SocketInterceptor } from '../../../src/interceptors/net'
import { request } from 'undici'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('mocks an undici request without any body', async () => {
  const errorListener = vi.fn()

  interceptor.on('connection', ({ socket }) => {
    socket.on('error', errorListener)
    socket.push('HTTP/1.1 200 OK\r\n\r\n')
  })

  const response = await request('http://localhost/resource')

  expect.soft(response.statusCode).toBe(200)
  expect.soft(errorListener).not.toHaveBeenCalled()
})
