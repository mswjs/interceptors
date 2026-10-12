// @vitest-environment node
import { setImmediate } from 'node:timers/promises'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

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

it('aborts a pending request on a kept-alive socket that already served a mocked response', async () => {
  const heldRequestReceived = Promise.withResolvers<Request>()
  const heldRequestAborted = Promise.withResolvers<void>()

  interceptor.on('request', async ({ request, controller }) => {
    if (request.url.endsWith('/held')) {
      heldRequestReceived.resolve(request)
      request.signal.addEventListener('abort', () => {
        heldRequestAborted.resolve()
      })
      // Keep the request pending until the client aborts it.
      await heldRequestAborted.promise
      return
    }

    /**
     * @note An explicit "Content-Length" makes the mocked response
     * self-delimiting, which allows the connection to stay alive.
     */
    controller.respondWith(
      new Response('ok', {
        headers: {
          'content-length': '2',
        },
      })
    )
  })

  await fetch('http://example.test/ok').then((response) => response.text())

  /**
   * @note Undici returns the socket to its pool a turn after the
   * response is consumed. Let it, so the next request to the same
   * origin reuses the kept-alive socket instead of connecting anew.
   */
  await setImmediate()

  const abortController = new AbortController()
  const abortErrorPromise = fetch('http://example.test/held', {
    signal: abortController.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  const heldRequest = await heldRequestReceived.promise
  abortController.abort()

  const abortError = await abortErrorPromise
  expect(abortError.name).toBe('AbortError')

  await expect(
    Promise.race([
      heldRequestAborted.promise,
      setImmediate().then(() => {
        throw new Error('The request signal was never aborted')
      }),
    ])
  ).resolves.toBeUndefined()
  expect(heldRequest.signal.aborted).toBe(true)
})
