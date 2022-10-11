import type { IncomingMessage } from 'http'
import { Response, ReadableStream } from '@remix-run/web-fetch'
import { objectToHeaders } from 'headers-polyfill'

/**
 * Creates a Fetch API `Response` instance from the given
 * `http.IncomingMessage` instance.
 */
export function createResponse(message: IncomingMessage): Response {
  const readable = new ReadableStream({
    start(controller) {
      message.on('data', (chunk) => controller.enqueue(chunk))
      message.on('end', () => controller.close())
    },
  })

  return new Response(readable, {
    status: message.statusCode,
    statusText: message.statusMessage,
    headers: objectToHeaders(message.headers),
  })
}
