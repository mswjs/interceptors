// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { FetchInterceptor } from '../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => void 0)

  interceptor.apply()
  interceptor.on('request', () => {
    throw new Error('Network error')
  })
})

afterAll(() => {
  vi.restoreAllMocks()
  interceptor.dispose()
})

it('treats middleware exceptions as 500 responses', async () => {
  const response = await fetch('http://localhost:3001/resource')

  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  expect(await response.json()).toEqual({
    name: 'Error',
    message: 'Network error',
    stack: expect.any(String),
  })
})
