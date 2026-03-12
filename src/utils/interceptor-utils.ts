import { Emitter } from 'rettime'

export function proxyEventListeners<T extends Emitter<any>>(options: {
  from: T
  to: T
  filter: (event: Emitter.Events<T>) => boolean
}) {
  const controller = new AbortController()

  const propagateEvent = async (event: Emitter.Events<T>) => {
    if (options.filter(event)) {
      await options.from.emitAsPromise(event)
    }
  }

  options.from.hooks.on(
    'newListener',
    (type) => {
      if (!options.to.listeners(type).includes(propagateEvent)) {
        options.to.on(type, propagateEvent, { signal: controller.signal })
      }
    },
    {
      persist: true,
      signal: controller.signal,
    }
  )

  options.from.hooks.on(
    'removeListener',
    (type) => {
      if (options.from.listenerCount(type) === 1) {
        options.to.removeListener(type, propagateEvent)
      }
    },
    {
      persist: true,
      signal: controller.signal,
    }
  )

  return () => {
    controller.abort()
  }
}
