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
  const warmupRequestInitiator = Promise.withResolvers<unknown>()
  const heldRequestReceived = Promise.withResolvers<Request>()
  const heldRequestInitiator = Promise.withResolvers<unknown>()
  const heldRequestAborted = Promise.withResolvers<void>()

  /**
   * @note Without a client interceptor (e.g. fetch), the request
   * initiator falls back to the socket itself. The same initiator
   * for both requests proves the second one reused the kept-alive
   * socket of the first.
   */
  interceptor.on('request', async ({ request, controller, initiator }) => {
    if (request.url.endsWith('/held')) {
      heldRequestReceived.resolve(request)
      heldRequestInitiator.resolve(initiator)
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
    warmupRequestInitiator.resolve(initiator)
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
  await expect(heldRequestInitiator.promise).resolves.toBe(
    await warmupRequestInitiator.promise
  )
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
