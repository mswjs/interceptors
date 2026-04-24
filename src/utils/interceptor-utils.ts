import { Emitter } from 'rettime'

export function proxyEventListeners<T extends Emitter<any>>(options: {
  from: T
  /**
   * A lazy getter of the destination emitter.
   * Handy because proxying has to be set up during an interceptor's constructor
   * when the this.emitter = runningInstance.emitter assignment hasn't been made yet.
   */
  to: () => T
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
      const to = options.to()

      if (!to.listeners(type).includes(propagateEvent)) {
        to.on(type, propagateEvent, { signal: controller.signal })
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
      const to = options.to()

      if (options.from.listenerCount(type) === 1) {
        to.removeListener(type, propagateEvent)
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
