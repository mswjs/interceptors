import { Response } from '@remix-run/web-fetch'
import { stringToHeaders } from 'headers-polyfill'

export function createResponse(
  request: XMLHttpRequest,
  responseBody: Buffer
): Response {
  return new Response(responseBody, {
    status: request.status,
    statusText: request.statusText,
    headers: stringToHeaders(request.getAllResponseHeaders()),
  })
}
