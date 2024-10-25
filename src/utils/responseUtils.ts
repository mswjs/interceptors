import { isPropertyAccessible } from './isPropertyAccessible'

/**
 * Response status codes for responses that cannot have body.
 * @see https://fetch.spec.whatwg.org/#statuses
 */
export const RESPONSE_STATUS_CODES_WITHOUT_BODY = new Set([
  101, 103, 204, 205, 304,
])

export const RESPONSE_STATUS_CODES_WITH_REDIRECT = new Set([
  301, 302, 303, 307, 308,
])

/**
 * Returns a boolean indicating whether the given response status
 * code represents a response that cannot have a body.
 */
export function isResponseWithoutBody(status: number): boolean {
  return RESPONSE_STATUS_CODES_WITHOUT_BODY.has(status)
}

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

/**
 * Creates a Fetch API `Response` instance.
 * Unlike the `Response` constructor, this function supports
 * non-configurable status codes (e.g. 101).
 */
export function createResponse(
  bodyInit?: BodyInit | null,
  init?: ResponseInit
): Response {
  const status = init?.status || 200
  const isAllowedStatus = status >= 200
  const body = isResponseWithoutBody(status) ? null : bodyInit

  const response = new Response(body, {
    ...init,
    status: isAllowedStatus ? status : 428,
  })

  if (!isAllowedStatus) {
    Object.defineProperty(response, 'status', {
      value: status,
      enumerable: true,
      writable: false,
    })
  }

  return response
}

export type ResponseError = Response & { type: 'error' }

/**
 * Check if the given response is a `Response.error()`.
 *
 * @note Some environments, like Miniflare (Cloudflare) do not
 * implement the "Response.type" property and throw on its access.
 * Safely check if we can access "type" on "Response" before continuing.
 * @see https://github.com/mswjs/msw/issues/1834
 */
export function isResponseError(response: Response): response is ResponseError {
  return isPropertyAccessible(response, 'type') && response.type === 'error'
}
