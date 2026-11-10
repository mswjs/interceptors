import { EventPolyfill } from '../polyfills/event-polyfill'
import { ProgressEventPolyfill } from '../polyfills/progress-event-polyfill'

const SUPPORTS_EVENT = typeof Event !== 'undefined'
const SUPPORTS_PROGRESS_EVENT = typeof ProgressEvent !== 'undefined'

export function createEvent(
  target: XMLHttpRequest | XMLHttpRequestUpload,
  type: string,
  init?: ProgressEventInit
): Event | EventPolyfill | ProgressEvent {
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
   * @see https://github.com/mswjs/interceptors/issues/40
   */
  const ProgressEventClass = SUPPORTS_PROGRESS_EVENT
    ? ProgressEvent
    : ProgressEventPolyfill

  if (progressEvents.includes(type)) {
    return new ProgressEventClass(type, {
      lengthComputable: true,
      loaded: init?.loaded || 0,
      total: init?.total || 0,
    })
  }

  /**
   * @note The target dispatches the event itself, and a native
   * event target (e.g. the browser's `XMLHttpRequest`) accepts
   * only genuine `Event` instances.
   */
  if (SUPPORTS_EVENT) {
    return new Event(type)
  }

  return new EventPolyfill(type, {
    target,
    currentTarget: target,
  })
}
