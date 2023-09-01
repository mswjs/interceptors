import { invariant } from 'outvariant'
import { until } from '@open-draft/until'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { AbortControllerManager } from '../../utils/AbortControllerManager'
import { uuidv4 } from '../../utils/uuid'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('fetch')

  constructor() {
    super(FetchInterceptor.symbol)
  }

  protected checkEnvironment() {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.fetch !== 'undefined'
    )
  }

  protected setup() {
    const pureFetch = globalThis.fetch

    invariant(
      !(pureFetch as any)[IS_PATCHED_MODULE],
      'Failed to patch the "fetch" module: already patched.'
    )

    const controllerManager = new AbortControllerManager()
    this.subscriptions.push(() => controllerManager.dispose())

    controllerManager.decorate()

    globalThis.fetch = async (input, init) => {
      const augmentedInit = { ...init }

      if (!augmentedInit.signal) {
        const abortController = new AbortController();
        augmentedInit.signal = abortController.signal;
      }

      const { signal } = augmentedInit
      invariant(signal, "Missing AbortSignal")

      controllerManager.registerSignal(signal);

      const requestId = uuidv4()
      const request = new Request(input, augmentedInit)

      this.logger.info('[%s] %s', request.method, request.url)

      const interactiveRequest = toInteractiveRequest(request)

      this.logger.info(
        'emitting the "request" event for %d listener(s)...',
        this.emitter.listenerCount('request')
      )
      this.emitter.emit('request', {
        request: interactiveRequest,
        requestId,
      })

      this.logger.info('awaiting for the mocked response...')

      const resolverResult = await until(async () => {
        await this.emitter.untilIdle(
          'request',
          ({ args: [{ requestId: pendingRequestId }] }) => {
            return pendingRequestId === requestId
          }
        )
        this.logger.info('all request listeners have been resolved!')

        const [mockedResponse] = await interactiveRequest.respondWith.invoked()
        this.logger.info('event.respondWith called with:', mockedResponse)

        return mockedResponse
      })

      controllerManager.forgetSignal(signal)

      if (resolverResult.error) {
        const error = Object.assign(new TypeError('Failed to fetch'), {
          cause: resolverResult.error,
        })
        return Promise.reject(error)
      }

      const mockedResponse = resolverResult.data

      if (mockedResponse && !request.signal?.aborted) {
        this.logger.info('received mocked response:', mockedResponse)
        const responseClone = mockedResponse.clone()

        this.emitter.emit('response', {
          response: responseClone,
          isMockedResponse: true,
          request: interactiveRequest,
          requestId,
        })

        const response = new Response(mockedResponse.body, mockedResponse)

        // Set the "response.url" property to equal the intercepted request URL.
        Object.defineProperty(response, 'url', {
          writable: false,
          enumerable: true,
          configurable: false,
          value: request.url,
        })

        return response
      }

      this.logger.info('no mocked response received!')

      return pureFetch(request).then((response) => {
        const responseClone = response.clone()
        this.logger.info('original fetch performed', responseClone)

        this.emitter.emit('response', {
          response: responseClone,
          isMockedResponse: false,
          request: interactiveRequest,
          requestId,
        })

        return response
      })
    }

    Object.defineProperty(globalThis.fetch, IS_PATCHED_MODULE, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    this.subscriptions.push(() => {
      Object.defineProperty(globalThis.fetch, IS_PATCHED_MODULE, {
        value: undefined,
      })

      globalThis.fetch = pureFetch

      this.logger.info(
        'restored native "globalThis.fetch"!',
        globalThis.fetch.name
      )
    })
  }
}
