type HeaderTuple = [string, string]
type RawHeaders = Array<HeaderTuple>

const kRawHeaders = Symbol('kRawHeaders')
const kRestoreHeaders = Symbol('kRestoreHeaders')

function recordRawHeader(headers: Headers, args: HeaderTuple) {
  if (!Reflect.has(headers, kRawHeaders)) {
    Object.defineProperty(headers, kRawHeaders, {
      value: [],
      enumerable: false,
      writable: false,
    })
  }

  const rawHeaders = Reflect.get(headers, kRawHeaders) as RawHeaders
  rawHeaders.push(args)
}

/**
 * Patch the global `Headers` class to store raw headers.
 * This is for compatibility with `IncomingMessage.prototype.rawHeaders`.
 *
 * @note Node.js has their own raw headers symbol but it
 * only records the first header name in case of multi-value headers.
 * Any other headers are normalized before comparing. This makes it
 * incompatible with the `rawHeaders` format.
 *
 * let h = new Headers()
 * h.append('X-Custom', 'one')
 * h.append('x-custom', 'two')
 * h[Symbol('headers map')] // Map { 'X-Custom' => 'one, two' }
 */
export function recordRawFetchHeaders() {
  // Prevent patching the Headers prototype multiple times.
  if (Reflect.get(Headers, kRestoreHeaders)) {
    return Reflect.get(Headers, kRestoreHeaders)
  }

  const { set, append, delete: headersDeleteMethod } = Headers.prototype

  Object.defineProperty(Headers, kRestoreHeaders, {
    value: () => {
      Headers.prototype.set = set
      Headers.prototype.append = append
      Headers.prototype.delete = headersDeleteMethod
    },
    enumerable: false,
  })

  Headers.prototype.set = new Proxy(Headers.prototype.set, {
    apply(target, thisArg, args: HeaderTuple) {
      recordRawHeader(thisArg, args)
      return Reflect.apply(target, thisArg, args)
    },
  })

  Headers.prototype.append = new Proxy(Headers.prototype.append, {
    apply(target, thisArg, args: HeaderTuple) {
      recordRawHeader(thisArg, args)
      return Reflect.apply(target, thisArg, args)
    },
  })

  Headers.prototype.delete = new Proxy(Headers.prototype.delete, {
    apply(target, thisArg, args: [string]) {
      const rawHeaders = Reflect.get(thisArg, kRawHeaders) as RawHeaders

      if (rawHeaders) {
        const nextRawHeaders = rawHeaders.filter(
          ([name]) => name.toLowerCase() !== args[0]
        )
        Reflect.set(thisArg, kRawHeaders, nextRawHeaders)
      }

      return Reflect.apply(target, thisArg, args)
    },
  })
}

export function restoreHeadersPrototype() {
  if (!Reflect.get(Headers, kRestoreHeaders)) {
    return
  }

  Reflect.get(Headers, kRestoreHeaders)()
}

export function getRawFetchHeaders(headers: Headers): RawHeaders {
  // Return the raw headers, if recorded (i.e. `.set()` or `.append()` was called).
  // If no raw headers were recorded, return all the headers.
  return Reflect.get(headers, kRawHeaders) || Array.from(headers.entries())
}
