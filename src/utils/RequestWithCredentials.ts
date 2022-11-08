import { Request } from '@remix-run/web-fetch'

/**
 * Custom wrapper around Remix's "Request" until it
 * supports "credentials" correctly.
 * @see https://github.com/remix-run/web-std-io/pull/21
 */
function RequestOverride(
  input: string | URL | Request,
  init?: RequestInit
): Request {
  const request = new Request(input, init)

  Object.defineProperty(request, 'credentials', {
    value: init?.credentials || 'same-origin',
    enumerable: true,
    writable: false,
  })

  return request
}

export const RequestWithCredentials =
  RequestOverride as unknown as typeof Request
