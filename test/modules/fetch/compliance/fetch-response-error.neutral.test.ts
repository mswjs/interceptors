import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => void 0)
  interceptor.apply()
})

afterAll(() => {
  vi.restoreAllMocks()
  interceptor.dispose()
})

it('treats "Response.error()" as a network error', async ({ task }) => {
  interceptor.on('request', ({ controller }) => {
    /**
     * Responding with "Response.error()" is equivalent to
     * network error occurring during the request processing.
     * This must reject the request promise.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Response/error_static
     */
    controller.respondWith(Response.error())
  })

  const error = await fetch('http://localhost:3001/resource').then<
    null,
    TypeError
  >(
    () => null,
    (error) => error
  )

  expect(error).toBeInstanceOf(TypeError)

  if (task.file.projectName === 'browser') {
    expect(error!.message).toBe('Failed to fetch')
  } else {
    expect(error!.message).toBe('fetch failed')
  }
})
