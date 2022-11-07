import { Request } from '@remix-run/web-fetch'

/**
 * Custom wrapper around Remix's "Request" until it
 * supports "credentials" correctly.
 * @see https://github.com/remix-run/web-std-io/pull/21
 */
export function createRequestWithCredentials(
  input: string | URL | Request,
  init?: RequestInit
): Request {
  const request = new Request(input, init)

  Object.defineProperty(request, 'credentials', {
    enumerable: true,
    writable: false,
    value: init?.credentials || 'include',
  })

  return request
}
