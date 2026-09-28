import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const IS_BROWSER = typeof window !== 'undefined'

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

/**
 * @note In Node.js, the mocked response is received over the wire
 * so `fetch()` always resolves with a new `Response` instance.
 * In the browser, the interceptor resolves the mocked response directly.
 */
it.skipIf(!IS_BROWSER)(
  'resolves with the exact mocked response instance',
  async () => {
    const mockedResponse = new Response('hello world')
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(mockedResponse)
    })

    const response = await fetch('http://localhost/resource')

    expect(response).toBe(mockedResponse)
    await expect(response.text()).resolves.toBe('hello world')
  }
)

/**
 * @note Runtimes like workerd attach custom properties to `Response`
 * (e.g. `webSocket` on "101 Switching Protocols" responses). Wrapping
 * the mocked response in a new instance would drop those.
 */
it.skipIf(!IS_BROWSER)(
  'preserves custom properties on the mocked response',
  async () => {
    const mockedResponse = new Response('hello world')
    Object.defineProperty(mockedResponse, 'customProperty', {
      value: 'custom-value',
      enumerable: true,
    })
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(mockedResponse)
    })

    const response = await fetch('http://localhost/resource')

    expect(response).toHaveProperty('customProperty', 'custom-value')
  }
)

it.skipIf(!IS_BROWSER)(
  'resolves with a new response instance for a compressed mocked response',
  async () => {
    const mockedResponse = new Response(
      new Blob(['hello world'])
        .stream()
        .pipeThrough(new CompressionStream('gzip')),
      {
        headers: { 'content-encoding': 'gzip' },
      }
    )
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(mockedResponse)
    })

    const response = await fetch('http://localhost/resource')

    // A body cannot be swapped in place, so decompression creates a new instance.
    expect(response).not.toBe(mockedResponse)
    expect(response.url).toBe('http://localhost/resource')
    await expect(response.text()).resolves.toBe('hello world')
  }
)
