import { Debugger, debug } from 'debug'
import { Emitter, EventMap, Listener } from 'strict-event-emitter'
import { nextTick } from './nextTick'

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

  private log: Debugger
  protected queue: Map<keyof Events, Array<QueueItem<Events[any]>>>

  constructor() {
    super()

    this.log = debug('async-event-emitter')
    this.queue = new Map()

    this.readyState = AsyncEventEmitterReadyState.ACTIVE
  }

  public on<EventName extends keyof Events>(
    eventName: EventName,
    listener: Listener<any>
  ) {
    const log = this.log.extend('on')

    log('adding "%s" listener...', eventName)

    if (this.readyState === AsyncEventEmitterReadyState.DEACTIVATED) {
      log('the emitter is destroyed, skipping!')
      return this
    }

    return super.on(eventName, async (...args) => {
      // Event queue is always established when calling ".emit()".
      const queue = this.openListenerQueue(eventName)

      log('awaiting the "%s" listener...', eventName)

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

            log('"%s" listener has resolved!', eventName)
          } catch (error) {
            log('"%s" listener has rejected!', error)
            reject(error)
          }
        }),
      })
    })
  }

  public emit<EventName extends keyof Events>(
    eventName: EventName,
    ...data: Events[EventName]
  ): boolean {
    const log = this.log.extend('emit')

    log('emitting "%s" event...', eventName)

    if (this.readyState === AsyncEventEmitterReadyState.DEACTIVATED) {
      log('the emitter is destroyed, skipping!')
      return false
    }

    // Skip establishing event queues for internal listeners.
    // Those are not meant to be awaited.
    if (this.isInternalEventName(eventName)) {
      return super.emit(eventName, ...data)
    }

    // Establish the Promise queue for this particular event.
    this.openListenerQueue(eventName)

    log('appending a one-time cleanup "%s" listener...', eventName)

    // Append a one-time clean up listener.
    this.once(eventName, () => {
      // Clear the Promise queue for this particular event
      // in the next tick so the Promise in "untilIdle" has
      // the time to properly resolve.
      nextTick(() => {
        this.queue.delete(eventName)
        log('cleaned up "%s" listeners queue!', eventName)
      })
    })

    return super.emit(eventName, ...data)
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

  private openListenerQueue<EventName extends keyof Events>(
    eventName: EventName
  ): Array<QueueItem<Events[EventName]>> {
    const log = this.log.extend('openListenerQueue')
    log('opening "%s" listeners queue...', eventName)

    const queue = this.queue.get(eventName)

    if (!queue) {
      log('no queue found, creating one...')
      this.queue.set(eventName, [])
      return []
    }

    log('returning an exising queue:', queue)
    return queue
  }

  public removeAllListeners<EventName extends keyof Events>(
    eventName?: EventName
  ) {
    const log = this.log.extend('removeAllListeners')
    log('event:', eventName)

    if (eventName) {
      this.queue.delete(eventName)
      log(
        'cleared the "%s" listeners queue!',
        eventName,
        this.queue.get(eventName)
      )
    } else {
      this.queue.clear()
      log('cleared the listeners queue!', this.queue)
    }

    return super.removeAllListeners(eventName)
  }

  public activate(): void {
    const log = this.log.extend('activate')
    this.readyState = AsyncEventEmitterReadyState.ACTIVE
    log('set state to:', this.readyState)
  }

  /**
   * Deactivate this event emitter.
   * Deactivated emitter can no longer emit and listen to events
   * and needs to be activated again in order to do so.
   */
  public deactivate(): void {
    const log = this.log.extend('deactivate')

    log('removing all listeners...')
    this.removeAllListeners()

    this.readyState = AsyncEventEmitterReadyState.DEACTIVATED
    log('set state to:', this.readyState)
  }

  private isInternalEventName(eventName: string | number | symbol): boolean {
    return eventName === 'newListener' || eventName === 'removeListener'
  }
}
