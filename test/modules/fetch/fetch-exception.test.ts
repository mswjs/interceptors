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

it('treats middleware exceptions as TypeError: Failed to fetch', async () => {
  await fetch('http://localhost:3001/resource').catch(
    (error: TypeError & { cause: Error }) => {
      expect(error).toBeInstanceOf(TypeError)
      expect(error.message).toBe('Failed to fetch')
      // Internal: preserve the original middleware error.
      expect(error.cause).toEqual(new Error('Network error'))
    }
  )
})
