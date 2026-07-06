import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

const IS_BROWSER = typeof window !== 'undefined'

const server = getTestServer()
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
 * @note Requests to non-HTTP schemes (e.g. "about:") never establish
 * a network connection in Node.js so they cannot be intercepted there.
 */
it.skipIf(!IS_BROWSER)(
  'returns an empty string for a mocked response to an "about:" request',
  async () => {
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response('hello world'))
    })

    const response = await fetch('about:')
    expect(response.url).toBe('')
  }
)

it('returns the request url for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/does-not-matter')
  expect(response.url).toBe('http://localhost/does-not-matter')
})

it.skipIf(!IS_BROWSER)(
  'returns an empty string for a cloned mocked response to an "about:" request',
  async () => {
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response('hello world'))
    })

    const response = await fetch('about:')
    expect(response.clone().url).toBe('')
  }
)

it('returns the request url for a cloned mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/does-not-matter')
  expect(response.clone().url).toBe('http://localhost/does-not-matter')
})

it('returns the request url for a bypassed response', async () => {
  const requestUrl = server.http.url('/resource')
  const response = await fetch(requestUrl)
  expect(response.url).toBe(requestUrl.href)
})

it('returns the last response url in case of redirects', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/target')) {
      controller.respondWith(
        new Response(null, {
          status: 302,
          headers: {
            location: 'http://localhost/destination',
          },
        })
      )
      return
    }

    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://localhost/target')

  expect(response.url).toBe('http://localhost/destination')
  await expect(response.text()).resolves.toBe('hello world')
})

/**
 * @note The browser does not allow redefining `window.location`.
 * Relative requests in the browser are covered by the
 * "fetch-relative-url" test suite.
 */
it.skipIf(IS_BROWSER)('resolves relative URLs against location', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('Hello world'))
  })

  const originalLocation = globalThis.location
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost/path/'),
    configurable: true,
  })

  const response = await fetch('?x=y')
  expect(response.url).toBe('http://localhost/path/?x=y')

  Object.defineProperty(globalThis, 'location', {
    value: originalLocation,
    configurable: true,
  })
})
