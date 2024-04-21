/**
 * A `RequestError` class.
 * If thrown within the request listener, the request
 * will be errored with the thrown error.
 * @note It's up to the request client to surface this error.
 */
export class RequestError extends Error {
  constructor(message?: string) {
    super(message)
  }
}
