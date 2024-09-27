// @vitest-environment node
import { beforeAll, afterEach, afterAll, it, expect } from 'vitest'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { RequestAbortError } from '../../../../src/RequestController'

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

it('aborts a request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.abort()
  })

  await expect(fetch('http://localhost/irrelevant')).rejects.toThrow(
    new RequestAbortError()
  )
})
