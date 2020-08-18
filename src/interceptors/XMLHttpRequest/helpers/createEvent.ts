import { EventPolyfill } from '../polyfills/EventPolyfill'
import { ProgressEventPolyfill } from '../polyfills/ProgressEventPolyfill'

const SUPPORTS_PROGRESS_EVENT = typeof ProgressEvent !== 'undefined'

export function createEvent(options: any, target: any, type: string) {
  const progressEvents = [
    'error',
    'progress',
    'loadstart',
    'loadend',
    'load',
    'timeout',
    'abort',
  ]

  /**
   * `ProgressEvent` is not supported in React Native.
   * @see https://github.com/mswjs/node-request-interceptor/issues/40
   */
  const ProgressEventClass = SUPPORTS_PROGRESS_EVENT
    ? ProgressEvent
    : ProgressEventPolyfill

  const event = progressEvents.includes(type)
    ? new ProgressEventClass(type, {
        lengthComputable: true,
        loaded: options?.loaded || 0,
        total: options?.total || 0,
      })
    : new EventPolyfill(type, {
        target,
        currentTarget: target,
      })

  return event
}
