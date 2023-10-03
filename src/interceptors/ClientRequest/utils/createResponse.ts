import { Readable } from 'stream'
import type { IncomingHttpHeaders, IncomingMessage } from 'http'
import { invariant } from 'outvariant'
import { responseStatusCodesWithoutBody } from '../../../utils/responseUtils'

/**
 * Creates a Fetch API `Response` instance from the given
 * `http.IncomingMessage` instance.
 */
export function createResponse(
  message: IncomingMessage,
  bodyStream?: Readable
): Response {
  const statusCode = message.statusCode || 200
  const readable = bodyStream || message

  invariant(
    message.readable,
    'Failed to create Response from IncomingMessage: message not readable'
  )
  invariant(
    message.readableEnded,
    'Failed to create Response from IncomingMessage: message already read'
  )

  if (bodyStream) {
    invariant(
      bodyStream.readable,
      'Failed to create Response from IncomingMessage using custom body Readable: stream not readable'
    )
    invariant(
      bodyStream.readableEnded,
      'Failed to create Response from IncomingMessage using custom Readable: stream already read'
    )
  }

  const responseBodyOrNull = responseStatusCodesWithoutBody.includes(statusCode)
    ? null
    : new ReadableStream({
        start(controller) {
          readable.on('data', (chunk) => controller.enqueue(chunk))
          readable.on('error', (error) => controller.error(error))
          readable.on('end', () => controller.close())
        },
      })

  return new Response(responseBodyOrNull, {
    status: message.statusCode,
    statusText: message.statusMessage,
    headers: createHeadersFromIncomingHttpHeaders(message.headers),
  })
}

function createHeadersFromIncomingHttpHeaders(
  httpHeaders: IncomingHttpHeaders
): Headers {
  const headers = new Headers()

  for (const headerName in httpHeaders) {
    const headerValues = httpHeaders[headerName]

    if (typeof headerValues === 'undefined') {
      continue
    }

    if (Array.isArray(headerValues)) {
      headerValues.forEach((headerValue) => {
        headers.append(headerName, headerValue)
      })

      continue
    }

    headers.set(headerName, headerValues)
  }

  return headers
}
