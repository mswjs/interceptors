// @vitest-environment node
import http from 'node:http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { createRawTestServer, toWebResponse } from '#/test/helpers'

/**
 * @note Header values are byte strings: Node.js writes the request
 * and the response heads as Latin-1, one byte per character. The
 * interceptor must preserve those bytes in both directions, for
 * passthrough and mocked exchanges alike.
 * @see https://fetch.spec.whatwg.org/#headers-class
 */
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

function createLatin1Server(requestListener: (name: string) => void) {
  return createRawTestServer(() => {
    return http.createServer((request, response) => {
      requestListener(String(request.headers['x-name']))
      response.setHeader('x-file', 'résumé')
      response.end()
    })
  })
}

it('preserves latin-1 header values of a passthrough "http" request and its response', async () => {
  const requestListener = vi.fn()
  await using server = await createLatin1Server(requestListener)

  const request = http.request(server.http.url('/resource'), {
    headers: { 'x-name': 'José' },
  })
  request.end()
  const [response] = await toWebResponse(request)

  expect.soft(requestListener).toHaveBeenCalledExactlyOnceWith('José')
  expect.soft(response.headers.get('x-file')).toBe('résumé')
})

it('preserves latin-1 header values of a passthrough "fetch" request and its response', async () => {
  const requestListener = vi.fn()
  await using server = await createLatin1Server(requestListener)

  const response = await fetch(server.http.url('/resource'), {
    headers: { 'x-name': 'José' },
  })

  expect.soft(requestListener).toHaveBeenCalledExactlyOnceWith('José')
  expect.soft(response.headers.get('x-file')).toBe('résumé')
})

it('preserves latin-1 header values of a mocked "http" request and its response', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.headers.get('x-name'))
    controller.respondWith(new Response(null, { headers: { 'x-file': 'résumé' } }))
  })

  const request = http.request('http://localhost/resource', {
    headers: { 'x-name': 'José' },
  })
  request.end()
  const [response] = await toWebResponse(request)

  expect.soft(requestListener).toHaveBeenCalledExactlyOnceWith('José')
  expect.soft(response.headers.get('x-file')).toBe('résumé')
})

it('preserves latin-1 header values of a mocked "fetch" request and its response', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.headers.get('x-name'))
    controller.respondWith(new Response(null, { headers: { 'x-file': 'résumé' } }))
  })

  const response = await fetch('http://localhost/resource', {
    headers: { 'x-name': 'José' },
  })

  expect.soft(requestListener).toHaveBeenCalledExactlyOnceWith('José')
  expect.soft(response.headers.get('x-file')).toBe('résumé')
})
