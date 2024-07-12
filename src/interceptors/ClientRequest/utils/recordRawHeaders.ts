type HeaderTuple = [string, string]
type RawHeaders = Array<HeaderTuple>

const kRawHeaders = Symbol('kRawHeaders')
const kRestorePatches = Symbol('kRestorePatches')

function recordRawHeader(headers: Headers, args: HeaderTuple) {
  if (!Reflect.has(headers, kRawHeaders)) {
    defineRawHeaders(headers, [])
  }
  const rawHeaders = Reflect.get(headers, kRawHeaders) as RawHeaders
  rawHeaders.push(args)
}

function defineRawHeaders(headers: Headers, rawHeaders: RawHeaders): void {
  if (Reflect.has(headers, kRawHeaders)) {
    return
  }

  Object.defineProperty(headers, kRawHeaders, {
    value: rawHeaders,
    enumerable: false,
  })
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

  const {
    Headers: OriginalHeaders,
    Request: OriginalRequest,
    Response: OriginalResponse,
  } = globalThis
  const { set, append, delete: headersDeleteMethod } = Headers.prototype

  Object.defineProperty(Headers, kRestorePatches, {
    value: () => {
      Headers.prototype.set = set
      Headers.prototype.append = append
      Headers.prototype.delete = headersDeleteMethod
      globalThis.Headers = OriginalHeaders

      globalThis.Request = OriginalRequest
      globalThis.Response = OriginalResponse

      Reflect.deleteProperty(Headers, kRestorePatches)
    },
    enumerable: false,
    /**
     * @note Mark this property as configurable
     * so we can delete it using `Reflect.delete` during cleanup.
     */
    configurable: true,
  })

  Headers = new Proxy(Headers, {
    construct(target, args, newTarget) {
      const headersInit = args[0] || []

      if (
        headersInit instanceof Headers &&
        Reflect.has(headersInit, kRawHeaders)
      ) {
        const headers = Reflect.construct(
          target,
          [Reflect.get(headersInit, kRawHeaders)],
          newTarget
        )
        defineRawHeaders(headers, Reflect.get(headersInit, kRawHeaders))
        return headers
      }

      const headers = Reflect.construct(target, args, newTarget)

      // Request/Response constructors will set the symbol
      // upon creating a new instance, using the raw developer
      // input as the raw headers. Skip the symbol altogether
      // in those cases because the input to Headers will be normalized.
      if (!Reflect.has(headers, kRawHeaders)) {
        const rawHeadersInit = Array.isArray(headersInit)
          ? headersInit
          : Object.entries(headersInit)
        defineRawHeaders(headers, rawHeadersInit)
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
      /**
       * @note If the headers init argument of Request
       * is existing Headers instance, use its raw headers
       * as the headers init instead.
       * This is needed because the Headers constructor copies
       * all normalized headers from the given Headers instance
       * and uses ".append()" to add it to the new instance.
       */
      if (
        typeof args[1] === 'object' &&
        args[1].headers != null &&
        args[1].headers instanceof Headers &&
        Reflect.has(args[1].headers, kRawHeaders)
      ) {
        args[1].headers = args[1].headers[kRawHeaders]
      }

      const request = Reflect.construct(target, args, newTarget)

      if (typeof args[1] === 'object' && args[1].headers != null) {
        defineRawHeaders(request.headers, inferRawHeaders(args[1].headers))
      }

      return request
    },
  })

  Response = new Proxy(Response, {
    construct(target, args, newTarget) {
      if (
        typeof args[1] === 'object' &&
        args[1].headers != null &&
        args[1].headers instanceof Headers &&
        Reflect.has(args[1].headers, kRawHeaders)
      ) {
        args[1].headers = args[1].headers[kRawHeaders]
      }

      const response = Reflect.construct(target, args, newTarget)

      if (typeof args[1] === 'object' && args[1].headers != null) {
        defineRawHeaders(response.headers, inferRawHeaders(args[1].headers))
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
  // If the raw headers recording failed for some reason,
  // use the normalized header entries instead.
  if (!Reflect.has(headers, kRawHeaders)) {
    return Array.from(headers.entries())
  }

  const rawHeaders = Reflect.get(headers, kRawHeaders) as RawHeaders
  return rawHeaders.length > 0 ? rawHeaders : Array.from(headers.entries())
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
