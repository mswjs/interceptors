// @vitest-environment node
import { inject } from 'vitest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const nodeMajorVersion = inject('nodeMajorVersion')

const fetchInterceptor = new FetchInterceptor()
const httpInterceptor = new HttpRequestInterceptor()

beforeAll(() => {
  fetchInterceptor.apply()
  httpInterceptor.apply()
})

afterEach(() => {
  fetchInterceptor.removeAllListeners()
  httpInterceptor.removeAllListeners()
})

afterAll(() => {
  fetchInterceptor.dispose()
  httpInterceptor.dispose()
})

/**
 * Get the WebSocket test server URL with the "http:" protocol,
 * the way an upgrade request addresses it.
 */
function getHttpUrlOfWsServer(searchParams = ''): string {
  const url = new URL(searchParams, server.ws.href)
  url.protocol = 'http:'
  return url.href
}

it('rejects a fetch upgrade request the same way undici does (upgrade header)', async () => {
  const requestListener = vi.fn()
  fetchInterceptor.on('request', requestListener)

  /**
   * @note Undici forbids the "upgrade" request header on `fetch()`
   * and rejects locally, before any connection is made. A fetch
   * request cannot upgrade to the WebSocket protocol in Node.js.
   * The interception must preserve that environment behavior.
   */
  const error = await fetch(getHttpUrlOfWsServer(), {
    headers: {
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
  }).then<null, TypeError & { cause?: unknown }>(
    () => null,
    (error) => error
  )

  expect(error).toBeInstanceOf(TypeError)
  expect(error!.message).toBe('fetch failed')
  expect(error!.cause).toMatchObject({
    name: 'InvalidArgumentError',
    message: 'invalid upgrade header',
  })

  // The request is rejected by the client before it is sent,
  // so it must never reach the interceptor.
  expect(requestListener).not.toHaveBeenCalled()
})

it('rejects a fetch upgrade request the same way undici does (connection header)', async () => {
  const requestListener = vi.fn()
  fetchInterceptor.on('request', requestListener)

  const error = await fetch(getHttpUrlOfWsServer(), {
    headers: {
      connection: 'upgrade',
      upgrade: 'websocket',
    },
  }).then<null, TypeError & { cause?: unknown }>(
    () => null,
    (error) => error
  )

  expect(error).toBeInstanceOf(TypeError)
  expect(error!.message).toBe('fetch failed')
  expect(error!.cause).toMatchObject(
    /**
     * @note Undici bundled with Node.js 24+ no longer forbids the
     * "connection" request header, so the rejection comes from the
     * "upgrade" header check instead.
     */
    nodeMajorVersion >= 24
      ? { name: 'InvalidArgumentError', message: 'invalid upgrade header' }
      : { name: 'InvalidArgumentError', message: 'invalid connection header' }
  )

  expect(requestListener).not.toHaveBeenCalled()
})

it('handles a fetch request with only the "connection" header set to "upgrade"', async () => {
  const requestListener = vi.fn()
  fetchInterceptor.on('request', ({ request, controller }) => {
    requestListener(request.headers.get('connection'))
    controller.respondWith(new Response('handled'))
  })

  const fetchPromise = fetch('http://example.com/resource', {
    headers: {
      connection: 'upgrade',
    },
  })

  if (nodeMajorVersion >= 24) {
    /**
     * @note Undici bundled with Node.js 24+ allows the custom
     * "connection" request header. Without the "upgrade" header,
     * this is a regular request that dispatches and gets intercepted.
     */
    const response = await fetchPromise
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('handled')

    expect(requestListener).toHaveBeenCalledOnce()

    /**
     * @note Undici manages the connection lifecycle itself: it accepts
     * the custom "connection" header but sends "keep-alive" on the wire.
     * The interceptor exposes the request as it was actually sent.
     */
    expect(requestListener).toHaveBeenCalledWith('keep-alive')
  } else {
    const error = await fetchPromise.then<null, TypeError & { cause?: unknown }>(
      () => null,
      (error) => error
    )

    expect(error).toBeInstanceOf(TypeError)
    expect(error!.cause).toMatchObject({
      name: 'InvalidArgumentError',
      message: 'invalid connection header',
    })

    expect(requestListener).not.toHaveBeenCalled()
  }
})

it('performs the upgrade request of an intercepted "WebSocket" connection', async () => {
  const requestListener = vi.fn()
  httpInterceptor.on('request', ({ request }) => {
    requestListener(request.method, request.headers.get('upgrade'))
  })

  /**
   * @note Unlike the public `fetch()`, the global `WebSocket` in
   * Node.js performs an actual HTTP upgrade request. With the HTTP
   * interception active and no listeners handling the request, the
   * upgrade must pass through to the real WebSocket server.
   */
  const socket = new WebSocket(server.ws.url('?greet'))

  const openListener = vi.fn()
  const messageListener = vi.fn()
  const errorListener = vi.fn()
  socket.addEventListener('open', openListener)
  socket.addEventListener('message', messageListener)
  socket.addEventListener('error', errorListener)

  await vi.waitFor(() => {
    expect(messageListener).toHaveBeenCalledOnce()
  })

  expect(openListener).toHaveBeenCalledOnce()
  expect(errorListener).not.toHaveBeenCalled()

  const [messageEvent] = messageListener.mock.calls[0]
  expect(messageEvent.data).toBe('hello world')

  // The upgrade request itself is observable by the interceptor.
  expect(requestListener).toHaveBeenCalledOnce()
  expect(requestListener).toHaveBeenCalledWith('GET', 'websocket')

  socket.close()
})
