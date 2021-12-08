import type { XMLHttpRequestBodyType } from '../patchXMLHttpRequest'

/**
 * Returns the computed length of the XMLHttpRequest body.
 */
export function getRequestBodyLength(body?: XMLHttpRequestBodyType): number {
  if (typeof body === 'string') {
    return body.length
  }

  if (
    (typeof Buffer !== 'undefined' && body instanceof Buffer) ||
    body instanceof ArrayBuffer
  ) {
    return body.byteLength
  }

  if (body instanceof Blob) {
    return body.size
  }

  if (body instanceof FormData) {
    /**
     * @note The content length of the form data does not equal
     * the actual "total" length when uploading it using XMLHttpRequest.
     */
    let length = 0

    for (const value of body
      // @ts-ignore Incompatible types between "lib" and Node.js.
      .values()) {
      length += typeof value === 'string' ? value.length : value.size
    }

    return length
  }

  if (body instanceof URLSearchParams) {
    // Return the length of the stringified search parameters string.
    // For example: "a=1&b=2" (7).
    return body.toString().length
  }

  if (body instanceof Document) {
    return body.body.textContent?.length || 0
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    throw new Error(
      'Failed to get request body length: "ReadableStream" body type is not supported.'
    )
  }

  return 0
}
