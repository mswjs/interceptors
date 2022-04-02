import { StrictEventEmitter, EventMapType } from 'strict-event-emitter'
import { nextTick } from './nextTick'

export class AsyncEventEmitter<
  EventMap extends EventMapType
> extends StrictEventEmitter<EventMap> {
  private queue: Map<keyof EventMap, Promise<void>[]> = new Map()

  public on<Event extends keyof EventMap>(
    event: Event,
    listener: EventMap[Event]
  ) {
    return super.on(event, (async (...args: unknown[]) => {
      // Event queue is always established when calling ".emit()".
      const queue = this.queue.get(event)!

      // Whenever a listener is called, create a new Promise
      // that resolves when that listener function completes its execution.
      queue.push(
        new Promise(async (resolve, reject) => {
          try {
            // Treat listeners as potentially asynchronous functions
            // so they could be awaited.
            await listener(...args)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      )
    }) as EventMap[Event])
  }

  public emit<Event extends keyof EventMap>(
    event: Event,
    ...args: Parameters<EventMap[Event]>
  ): boolean {
    // Establish the Promise queue for this particular event.
    this.queue.set(event, [Promise.resolve()])

    // Append a one-time clean up listener.
    this.once(event, (() => {
      // Clear the Promise queue for this particular event
      // in the next tick so the Promise in "untilIdle" has
      // time to properly resolve.
      nextTick(() => {
        this.queue.delete(event)
      })
    }) as EventMap[Event])

    return super.emit(event, ...args)
  }

  /**
   * Returns a promise that resolves when all the listeners for the given event
   * has been called. Does not await the listeners themselves.
   * If the event has no listeners, resolves immediately.
   */
  public async untilIdle<Event extends keyof EventMap>(
    event: Event
  ): Promise<void> {
    await Promise.all(this.queue.get(event) || [])
  }
}
