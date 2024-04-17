/**
 * Response status codes for responses that cannot have body.
 * @see https://fetch.spec.whatwg.org/#statuses
 */
export const RESPONSE_STATUS_CODES_WITHOUT_BODY = new Set([
  101, 103, 204, 205, 304,
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
