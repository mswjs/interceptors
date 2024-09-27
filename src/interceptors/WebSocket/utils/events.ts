const kCancelable = Symbol('kCancelable')
const kDefaultPrevented = Symbol('kDefaultPrevented')

function makeCancelableEvent(event: Event) {
  if (typeof Reflect.get(event, kCancelable) !== 'undefined') {
    return event
  }

  Object.defineProperties(event, {
    [kCancelable]: {
      value: event.cancelable,
      enumerable: false,
      writable: true,
    },
    [kDefaultPrevented]: {
      value: event.defaultPrevented,
      enumerable: false,
      writable: true,
    },
    cancelable: {
      get() {
        return this[kCancelable]
      },
      set(nextCancelable) {
        this[kCancelable] = nextCancelable
      },
    },
    defaultPrevented: {
      get() {
        return this[kDefaultPrevented]
      },
      set(nextDefaultPrevented) {
        return (this[kDefaultPrevented] = nextDefaultPrevented)
      },
    },
    preventDefault: {
      value() {
        if (this.cancelable && !this[kDefaultPrevented]) {
          this[kDefaultPrevented] = true
        }
      },
      enumerable: true,
    },
  })

  return event
}

/**
 * A `MessageEvent` superset that supports event cancellation
 * in Node.js. It's rather non-intrusive so it can be safely
 * used in the browser as well.
 *
 * @see https://github.com/nodejs/node/issues/51767
 */
export class CancelableMessageEvent<T = any> extends MessageEvent<T> {
  constructor(type: string, init: MessageEventInit<T>) {
    super(type, init)

    makeCancelableEvent(this)
  }
}

interface CloseEventInit extends EventInit {
  code?: number
  reason?: string
  wasClean?: boolean
}

export class CloseEvent extends Event {
  public code: number
  public reason: string
  public wasClean: boolean

  constructor(type: string, init: CloseEventInit = {}) {
    super(type, init)
    this.code = init.code === undefined ? 0 : init.code
    this.reason = init.reason === undefined ? '' : init.reason
    this.wasClean = init.wasClean === undefined ? false : init.wasClean
  }
}

export class CancelableCloseEvent extends CloseEvent {
  constructor(type: string, init: CloseEventInit) {
    super(type, init)
    makeCancelableEvent(this)
  }
}
