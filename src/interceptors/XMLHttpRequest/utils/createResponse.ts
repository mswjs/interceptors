import { Response } from 'undici'
import { stringToHeaders } from 'headers-polyfill'

export function createResponse(
  request: XMLHttpRequest,
  responseBody: Uint8Array
): Response {
  return new Response(responseBody, {
    status: request.status,
    statusText: request.statusText,
    headers: stringToHeaders(request.getAllResponseHeaders()),
  })
}
