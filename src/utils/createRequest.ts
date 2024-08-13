const REQUEST_METHODS_WITHOUT_BODY = ['CONNECT', 'HEAD', 'GET']
const FORBIDDEN_REQUEST_METHODS = ['CONNECT']

const kOriginalMethod = Symbol('kOriginalMethod')

export function isBodyAllowedForMethod(method: string): boolean {
  return !REQUEST_METHODS_WITHOUT_BODY.includes(method)
}

export function createRequest(
  info: RequestInfo | URL,
  init: RequestInit
): Request {
  const method = init.method?.toUpperCase() || 'GET'
  const canHaveBody = isBodyAllowedForMethod(method)
  const isMethodAllowed = !FORBIDDEN_REQUEST_METHODS.includes(method)

  // Support unsafe request methods.
  if (init.method && !isMethodAllowed) {
    init.method = `UNSAFE-${init.method}`
  }

  // Automatically set the undocumented `duplex` option from Undici
  // for POST requests with body.
  if (canHaveBody) {
    if (!Reflect.has(init, 'duplex')) {
      Object.defineProperty(init, 'duplex', {
        value: 'half',
        enumerable: true,
        writable: true,
      })
    }
  } else {
    // Force the request body to undefined in case of request methods
    // that cannot have a body. A convenience behavior.
    init.body = undefined
  }

  const request = new Request(info, init)

  if (!isMethodAllowed) {
    Object.defineProperty(request, 'method', {
      value: method,
    })
  }

  return request
}
