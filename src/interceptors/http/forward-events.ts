import { type Emitter } from 'rettime'
import {
  type HttpRequestEventMap,
  type HttpResponseEvent,
} from '#/src/events/http'
import { type Interceptor } from '#/src/interceptor'
import { type DisposableSubscription } from '#/src/disposable'

interface ForwardHttpEventsOptions {
  source: Interceptor<HttpRequestEventMap>
  emitter: Emitter<HttpRequestEventMap>
  predicate: (initiator: unknown) => boolean
  responsePredicate?: (event: HttpResponseEvent) => boolean
}

export function forwardHttpEvents(
  options: ForwardHttpEventsOptions
): DisposableSubscription {
  const controller = new AbortController()
  const { source, emitter, predicate, responsePredicate } = options

  source.on(
    'request',
    async (event) => {
      if (predicate(event.initiator)) {
        await emitter.emitAsPromise(event)
      }
    },
    {
      signal: controller.signal,
    }
  )

  const responseListener: Emitter.Listener<
    Emitter<HttpRequestEventMap>,
    'response'
  > = async (event) => {
    if (
      predicate(event.initiator) &&
      (responsePredicate == null || responsePredicate(event))
    ) {
      await emitter.emitAsPromise(event)
    }
  }

  const unhandledExceptionListener: Emitter.Listener<
    Emitter<HttpRequestEventMap>,
    'unhandledException'
  > = async (event) => {
    if (predicate(event.initiator)) {
      await emitter.emitAsPromise(event)
    }
  }

  const addResponseListener = (): void => {
    if (!source.listeners('response').includes(responseListener)) {
      source.on('response', responseListener, {
        signal: controller.signal,
      })
    }
  }

  const addUnhandledExceptionListener = (): void => {
    if (
      !source
        .listeners('unhandledException')
        .includes(unhandledExceptionListener)
    ) {
      source.on('unhandledException', unhandledExceptionListener, {
        signal: controller.signal,
      })
    }
  }

  if (emitter.listenerCount('response') > 0) {
    addResponseListener()
  }

  if (emitter.listenerCount('unhandledException') > 0) {
    addUnhandledExceptionListener()
  }

  emitter.hooks.on(
    'newListener',
    (type) => {
      if (type === 'response') {
        addResponseListener()
      }

      if (type === 'unhandledException') {
        addUnhandledExceptionListener()
      }
    },
    {
      signal: controller.signal,
      persist: true,
    }
  )

  emitter.hooks.on(
    'removeListener',
    (type) => {
      if (type === 'response' && emitter.listenerCount('response') === 0) {
        source.removeListener('response', responseListener)
      }

      if (
        type === 'unhandledException' &&
        emitter.listenerCount('unhandledException') === 0
      ) {
        source.removeListener(
          'unhandledException',
          unhandledExceptionListener
        )
      }
    },
    {
      signal: controller.signal,
      persist: true,
    }
  )

  return () => {
    controller.abort()
  }
}
