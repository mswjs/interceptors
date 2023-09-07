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
  const error = await fetch('http://localhost:3001/resource').then<
    null,
    TypeError & { cause: unknown }
  >(
    () => null,
    (error) => error
  )

  expect(error).toBeInstanceOf(TypeError)
  expect(error!.message).toBe('Failed to fetch')
  // Internal: preserve the original middleware error.
  expect(error!.cause).toEqual(new Error('Network error'))
})
