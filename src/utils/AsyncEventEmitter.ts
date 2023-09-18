import { Logger } from '@open-draft/logger'
import { Emitter, EventMap, Listener } from 'strict-event-emitter'
import { nextTick } from './nextTick'
import { invariant } from 'outvariant'

export interface QueueItem<Args extends Array<unknown>> {
  args: Args
  done: Promise<void>
}

export enum AsyncEventEmitterReadyState {
  ACTIVE = 'ACTIVE',
  DEACTIVATED = 'DEACTIVATED',
}

export class AsyncEventEmitter<
  Events extends EventMap
> extends Emitter<Events> {
  public readyState: AsyncEventEmitterReadyState

  protected logger: Logger

  protected wrappedListeners: Map<Function, Listener<any>>
  protected queue: Map<keyof Events, Array<QueueItem<Events[any]>>>

  constructor() {
    super()

    this.logger = new Logger('async-event-emitter')
    this.wrappedListeners = new Map()
    this.queue = new Map()

    this.readyState = AsyncEventEmitterReadyState.ACTIVE
  }

  public on<EventName extends keyof Events>(
    eventName: EventName,
    listener: Listener<any>
  ) {
    const logger = this.logger.extend('on')

    logger.info('adding "%s" listener...', eventName)

    if (this.readyState === AsyncEventEmitterReadyState.DEACTIVATED) {
      logger.info('the emitter is destroyed, skipping!')
      return this
    }

    const wrappedListener = this.wrapListener(eventName, listener)

    // Associate the raw listener function with the wrapped listener
    // to be able to remove this listener by the raw function reference.
    this.wrappedListeners.set(listener, wrappedListener)

    return super.on(eventName, wrappedListener)
  }

  public once<EventName extends keyof Events>(
    eventName: EventName,
    listener: Listener<any>
  ): this {
    const wrappedListener = this.wrapListener(eventName, listener)
    this.wrappedListeners.set(listener, wrappedListener)

    return super.once(eventName, wrappedListener)
  }

  public emit<EventName extends keyof Events>(
    eventName: EventName,
    ...data: Events[EventName]
  ): boolean {
    const logger = this.logger.extend('emit')

    logger.info('emitting "%s" event...', eventName)

    if (this.readyState === AsyncEventEmitterReadyState.DEACTIVATED) {
      logger.info('the emitter is destroyed, skipping!')
      return false
    }

    // Skip establishing event queues for internal listeners.
    // Those are not meant to be awaited.
    if (this.isInternalEventName(eventName)) {
      return super.emit(eventName, ...data)
    }

    // Establish the Promise queue for this particular event.
    this.openListenerQueue(eventName)

    logger.info('appending a one-time cleanup "%s" listener...', eventName)

    // Append a one-time clean up listener.
    this.once(eventName, () => {
      // Clear the Promise queue for this particular event
      // in the next tick so the Promise in "untilIdle" has
      // the time to properly resolve.
      nextTick(() => {
        this.queue.delete(eventName)
        logger.info('cleaned up "%s" listeners queue!', eventName)
      })
    })

    return super.emit(eventName, ...data)
  }

  public removeListener<EventName extends keyof Events>(
    eventName: EventName,
    listener: Listener<any>
  ): this {
    const wrappedListener = this.wrappedListeners.get(listener)

    if (!wrappedListener) {
      return this
    }

    return super.removeListener(eventName, wrappedListener)
  }

  /**
   * Returns a promise that resolves when all the listeners for the given event
   * has been called. Awaits asynchronous listeners.
   * If the event has no listeners, resolves immediately.
   */
  public async untilIdle<EventName extends keyof Events>(
    eventName: EventName,
    filter: (item: QueueItem<Events[EventName]>) => boolean = () => true
  ): Promise<void> {
    const listenersQueue = this.queue.get(eventName) || []

    await Promise.all(
      listenersQueue.filter(filter).map(({ done }) => done)
    ).finally(() => {
      // Clear the queue one the promise settles
      // so that different events don't share the same queue.
      this.queue.delete(eventName)
    })
  }

  private wrapListener<EventName extends keyof Events>(
    eventName: EventName,
    listener: Listener<any>
  ): Listener<any> {
    const logger = this.logger.extend('wrapListener')

    const wrappedListener: Listener<Events[EventName]> = async (...args) => {
      // Event queue is always established when calling ".emit()".
      const queue = this.openListenerQueue(eventName)

      logger.info('awaiting the "%s" listener...', eventName)

      // Whenever a listener is called, create a new Promise
      // that resolves when that listener function completes its execution.
      queue.push({
        args,
        done: new Promise<void>(async (resolve, reject) => {
          try {
            // Treat listeners as potentially asynchronous functions
            // so they could be awaited.
            await listener(...args)
            resolve()

            logger.info('"%s" listener has resolved!', eventName)
          } catch (error) {
            logger.info('"%s" listener has rejected!', error)
            reject(error)
          }
        }),
      })
    }

    return wrappedListener
  }

  private openListenerQueue<EventName extends keyof Events>(
    eventName: EventName
  ): Array<QueueItem<Events[EventName]>> {
    const logger = this.logger.extend('openListenerQueue')
    logger.info('opening "%s" listeners queue...', eventName)

    const queue = this.queue.get(eventName)

    if (!queue) {
      logger.info('no queue found, creating one...')
      this.queue.set(eventName, [])
      return []
    }

    logger.info('returning an exising queue:', queue)
    return queue
  }

  public removeAllListeners<EventName extends keyof Events>(
    eventName?: EventName
  ) {
    const logger = this.logger.extend('removeAllListeners')
    logger.info('event:', eventName)

    if (eventName) {
      this.queue.delete(eventName)
      logger.info(
        'cleared the "%s" listeners queue!',
        eventName,
        this.queue.get(eventName)
      )
    } else {
      this.queue.clear()
      logger.info('cleared the listeners queue!', this.queue)
    }

    return super.removeAllListeners(eventName)
  }

  public activate(): void {
    const logger = this.logger.extend('activate')
    this.readyState = AsyncEventEmitterReadyState.ACTIVE
    logger.info('set state to:', this.readyState)
  }

  /**
   * Deactivate this event emitter.
   * Deactivated emitter can no longer emit and listen to events
   * and needs to be activated again in order to do so.
   */
  public deactivate(): void {
    const logger = this.logger.extend('deactivate')

    logger.info('removing all listeners...')
    this.removeAllListeners()

    this.readyState = AsyncEventEmitterReadyState.DEACTIVATED
    logger.info('set state to:', this.readyState)
  }

  private isInternalEventName(eventName: string | number | symbol): boolean {
    return eventName === 'newListener' || eventName === 'removeListener'
  }
}
