export const FORBIDDEN_REQUEST_METHODS = ['CONNECT', 'TRACK', 'TRACE']

/**
 * Response status codes for responses that cannot have body.
 * @see https://fetch.spec.whatwg.org/#statuses
 */
export const RESPONSE_STATUS_CODES_WITHOUT_BODY = [204, 205, 304]
