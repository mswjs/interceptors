import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { FetchResponse } from '#/src/utils/fetch-utils'

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

it('rejects a mocked informational response like Undici does', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new FetchResponse(null, { status: 101 }))
  })

  const requestError = await fetch('http://localhost/resource')
    .then(() => {
      throw new Error('Must not resolve')
    })
    .catch<TypeError & { cause?: unknown }>((error) => error)

  expect(requestError).toBeInstanceOf(TypeError)
  expect(requestError.message).toBe('fetch failed')
  expect(requestError.cause).toEqual(
    new Error('Unsupported informational response status: 101')
  )
})
