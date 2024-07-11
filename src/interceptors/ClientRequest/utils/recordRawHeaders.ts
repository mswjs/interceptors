type HeaderTuple = [string, string]
type RawHeaders = Array<HeaderTuple>

const kRawHeaders = Symbol('kRawHeaders')
const kRestorePatches = Symbol('kRestorePatches')

function recordRawHeader(headers: Headers, args: HeaderTuple) {
  if (Reflect.get(headers, kRawHeaders) == null) {
    Object.defineProperty(headers, kRawHeaders, {
      value: [],
      enumerable: false,
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
  if (Reflect.get(Headers, kRestorePatches)) {
    return Reflect.get(Headers, kRestorePatches)
  }

  const { Request: OriginalRequest, Response: OriginalResponse } = globalThis
  const { set, append, delete: headersDeleteMethod } = Headers.prototype

  Object.defineProperty(Headers, kRestorePatches, {
    value: () => {
      Headers.prototype.set = set
      Headers.prototype.append = append
      Headers.prototype.delete = headersDeleteMethod

      globalThis.Request = OriginalRequest
      globalThis.Response = OriginalResponse

      Object.defineProperty(Headers, kRestorePatches, {
        value: undefined
      });
    },
    enumerable: false,
    configurable: true,
  })

  Headers = new Proxy(Headers, {
    construct(target, args, newTarget) {
      const headers = Reflect.construct(target, args, newTarget)
      const initialHeaders = args[0] || []
      const initialRawHeaders = Array.isArray(initialHeaders)
        ? initialHeaders
        : Object.entries(initialHeaders)

      // Request/Response constructors will set the symbol
      // upon creating a new instance, using the raw developer
      // input as the raw headers. Skip the symbol altogether
      // in those cases because the input to Headers will be normalized.
      if (!Reflect.has(headers, kRawHeaders)) {
        Object.defineProperty(headers, kRawHeaders, {
          value: initialRawHeaders,
          enumerable: false,
        })
      }

      return headers
    },
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
        for (let index = rawHeaders.length - 1; index >= 0; index--) {
          if (rawHeaders[index][0].toLowerCase() === args[0].toLowerCase()) {
            rawHeaders.splice(index, 1)
          }
        }
      }

      return Reflect.apply(target, thisArg, args)
    },
  })

  Request = new Proxy(Request, {
    construct(target, args, newTarget) {
      const request = Reflect.construct(target, args, newTarget)

      if (
        typeof args[1] === 'object' &&
        args[1].headers != null &&
        !request.headers[kRawHeaders]
      ) {
        request.headers[kRawHeaders] = inferRawHeaders(args[1].headers)
      }

      return request
    },
  })

  Response = new Proxy(Response, {
    construct(target, args, newTarget) {
      const response = Reflect.construct(target, args, newTarget)

      if (typeof args[1] === 'object' && args[1].headers != null) {
        /**
         * @note Pass the init argument directly because it gets
         * transformed into a normalized Headers instance once it
         * passes the Response constructor.
         */
        response.headers[kRawHeaders] = inferRawHeaders(args[1].headers)
      }

      return response
    },
  })
}

export function restoreHeadersPrototype() {
  if (!Reflect.get(Headers, kRestorePatches)) {
    return
  }

  Reflect.get(Headers, kRestorePatches)()
}

export function getRawFetchHeaders(headers: Headers): RawHeaders {
  // Return the raw headers, if recorded (i.e. `.set()` or `.append()` was called).
  // If no raw headers were recorded, return all the headers.
  return Reflect.get(headers, kRawHeaders) || Array.from(headers.entries())
}

/**
 * Infers the raw headers from the given `HeadersInit` provided
 * to the Request/Response constructor.
 *
 * If the `init.headers` is a Headers instance, use it directly.
 * That means the headers were created standalone and already have
 * the raw headers stored.
 * If the `init.headers` is a HeadersInit, create a new Headers
 * instace out of it.
 */
function inferRawHeaders(headers: HeadersInit): RawHeaders {
  if (headers instanceof Headers) {
    return Reflect.get(headers, kRawHeaders)
  }

  return Reflect.get(new Headers(headers), kRawHeaders)
}
