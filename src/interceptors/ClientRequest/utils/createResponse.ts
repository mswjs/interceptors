import type { IncomingHttpHeaders, IncomingMessage } from 'http'
import { RESPONSE_STATUS_CODES_WITHOUT_BODY } from '../../../utils/fetchUtils'

/**
 * Creates a Fetch API `Response` instance from the given
 * `http.IncomingMessage` instance.
 */
export function createResponse(message: IncomingMessage): Response {
  const responseBodyOrNull = RESPONSE_STATUS_CODES_WITHOUT_BODY.includes(
    message.statusCode || 200
  )
    ? null
    : new ReadableStream({
        start(controller) {
          message.on('data', (chunk) => controller.enqueue(chunk))
          message.on('end', () => controller.close())

          /**
           * @todo Should also listen to the "error" on the message
           * and forward it to the controller. Otherwise the stream
           * will pend indefinitely.
           */
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
