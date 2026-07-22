import { isObject } from './is-object'
import { isPropertyAccessible } from './is-property-accessible'

/**
 * Creates a generic 500 Unhandled Exception response.
 */
export function createServerErrorResponse(body: unknown): Response {
  return new Response(
    JSON.stringify(
      body instanceof Error
        ? {
            name: body.name,
            message: body.message,
            stack: body.stack,
          }
        : body
    ),
    {
      status: 500,
      statusText: 'Unhandled Exception',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

export type ResponseError = Response & { type: 'error' }

/**
 * A key on the error a mocked `Response.error()` destroys the socket
 * with, referencing that error response. Allows the client-side
 * interceptors (e.g. fetch) to surface the error response to the
 * consumer instead of the internal socket error.
 */
export const kErrorResponse = Symbol('kErrorResponse')

/**
 * Get the mocked error response that caused the given error, if any.
 */
export function getErrorResponse(error: unknown): ResponseError | undefined {
  if (
    error instanceof Error &&
    kErrorResponse in error &&
    isResponseError(error[kErrorResponse])
  ) {
    return error[kErrorResponse]
  }

  return undefined
}

/**
 * Check if the given response is a `Response.error()`.
 *
 * @note Some environments, like Miniflare (Cloudflare) do not
 * implement the "Response.type" property and throw on its access.
 * Safely check if we can access "type" on "Response" before continuing.
 * @see https://github.com/mswjs/msw/issues/1834
 */
export function isResponseError(response: unknown): response is ResponseError {
  return (
    response != null &&
    response instanceof Response &&
    isPropertyAccessible(response, 'type') &&
    response.type === 'error'
  )
}

/**
 * Check if the given value is a `Response` or a Response-like object.
 * This is different from `value instanceof Response` because it supports
 * custom `Response` constructors, like the one when using Undici directly.
 */
export function isResponseLike(value: unknown): value is Response {
  return (
    isObject<Record<string, any>>(value, true) &&
    isPropertyAccessible(value, 'status') &&
    isPropertyAccessible(value, 'statusText') &&
    isPropertyAccessible(value, 'bodyUsed')
  )
}
