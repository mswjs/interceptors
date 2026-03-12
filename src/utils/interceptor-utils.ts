import { DefaultEventMap, Emitter, EventMap } from 'rettime'

export function propagateHttpEvents<SourceEventMap extends DefaultEventMap>(
  source: Emitter<SourceEventMap>,
  destination: Emitter<any>,
  predicate: (event: EventMap.Events<SourceEventMap>) => boolean
) {
  const controller = new AbortController()

  const propagateEvent = async (event: EventMap.Events<SourceEventMap>) => {
    if (predicate(event)) {
      await destination.emitAsPromise(event)
    }
  }

  source.on(
    '*',
    async (event) => {
      if (event.type !== 'response') {
        await propagateEvent(event)
      }
    },
    { signal: controller.signal }
  )

  /**
   * @note Lazily add a "response" listener to the HTTP interceptor if this
   * interceptor receives a response listener. HTTP interceptor creates a
   * response parser only if a "response" listener is present.
   *
   * Cannot use hooks for this because `removeAllListeners()` in rettime
   * also removes hooks listeners, breaking lazy registration across tests.
   */
  destination.hooks.on(
    'newListener',
    (type) => {
      if (
        type === 'response' &&
        !source.listeners('response').includes(propagateEvent)
      ) {
        source.on('response', propagateEvent, { signal: controller.signal })
      }
    },
    { signal: controller.signal }
  )

  destination.hooks.on(
    'removeListener',
    (type) => {
      if (
        type === 'response' &&
        source.listeners('response').includes(propagateEvent)
      ) {
        source.removeListener('response', propagateEvent)
      }
    },
    {
      signal: controller.signal,
    }
  )

  return {
    controller,
  }
}
