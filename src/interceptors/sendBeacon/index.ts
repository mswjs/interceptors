import { Headers } from 'headers-polyfill'
import { invariant } from 'outvariant'
import { IsomorphicRequest } from '../../IsomorphicRequest'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { InteractiveIsomorphicRequest } from '../../InteractiveIsomorphicRequest'

export class SendBeaconInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('sendBeacon')

  constructor() {
    super(SendBeaconInterceptor.symbol)
  }

  protected checkEnvironment() {
    return typeof navigator.sendBeacon === 'function'
  }

  protected setup() {
    const pureSendBeacon = navigator.sendBeacon

    invariant(
      !(pureSendBeacon as any)[IS_PATCHED_MODULE],
      'Failed to patch the "sendBeacon" module: already patched.'
    )

    navigator.sendBeacon = (url, data) => {
      this.log('[%s] %s', 'POST', url)

      // Perform asynchronous part of sendBeacon.
      this.handleSendBeacon(pureSendBeacon, url, data)

      // We can not find out if a `sendBeacon` call would be rejected
      // by the user-agent, because it is not only dependent on the
      // payload size, but also other criteria like how many sendBeacon
      // calls are scheduled to be processed, which we can not know.
      // - https://github.com/whatwg/fetch/issues/679
      // - https://fetch.spec.whatwg.org/#concept-http-network-or-cache-fetch
      //
      // We also do not have access to the return value of `pureSendBeacon`,
      // because we need to check for mocked responses asynchronously to
      // decide if we need to call `pureSendBeacon`.
      return true
    }

    Object.defineProperty(navigator.sendBeacon, IS_PATCHED_MODULE, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    this.subscriptions.push(() => {
      Object.defineProperty(navigator.sendBeacon, IS_PATCHED_MODULE, {
        value: undefined,
      })

      navigator.sendBeacon = pureSendBeacon

      this.log(
        'restored native "navigator.sendBeacon"!',
        navigator.sendBeacon.name
      )
    })
  }

  /**
   * Handles the asynchronous part of the `sendBeacon` call.
   */
  protected async handleSendBeacon(
    pureSendBeacon: typeof navigator.sendBeacon,
    url: string,
    data?: BodyInit | null
  ) {
    const request = new Request(url, { body: data, method: 'POST' })
    const body = await request.clone().arrayBuffer()
    const contentType = getContentType(data)
    const headers = new Headers()
    if (contentType) headers.append('Content-Type', contentType)

    const isomorphicRequest = new IsomorphicRequest(
      new URL(url, location.origin),
      {
        method: 'POST',
        headers,
        body,
        credentials: 'include',
      }
    )

    const interactiveIsomorphicRequest = new InteractiveIsomorphicRequest(
      isomorphicRequest
    )

    this.log('isomorphic request', interactiveIsomorphicRequest)

    this.log(
      'emitting the "request" event for %d listener(s)...',
      this.emitter.listenerCount('request')
    )
    this.emitter.emit('request', interactiveIsomorphicRequest)

    this.log('awaiting for the mocked response...')

    await this.emitter.untilIdle('request', ({ args: [request] }) => {
      return request.id === interactiveIsomorphicRequest.id
    })
    this.log('all request listeners have been resolved!')

    const [mockedResponse] =
      await interactiveIsomorphicRequest.respondWith.invoked()
    this.log('event.respondWith called with:', mockedResponse)

    if (mockedResponse) {
      this.log('received mocked response:', mockedResponse)

      this.log('original sendBeacon not performed')

      return
    }

    this.log('no mocked response received!')

    pureSendBeacon(url, data)

    this.log('original sendBeacon performed')
  }
}

/**
 * Parses the content type the same way `sendBeacon` is doing.
 * See: https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 */
function getContentType(body: BodyInit | null | undefined) {
  if (typeof body === 'string') return 'text/plain;charset=UTF-8'
  if (body instanceof Blob) return body.type === '' ? undefined : body.type
  if (body instanceof URLSearchParams)
    return 'application/x-www-form-urlencoded;charset=UTF-8'
  if (body instanceof FormData) return 'multipart/form-data'
  return undefined
}
