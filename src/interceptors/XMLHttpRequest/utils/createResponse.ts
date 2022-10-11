import { Response } from '@remix-run/web-fetch'
import { stringToHeaders } from 'headers-polyfill'

export function createResponse(request: XMLHttpRequest): Response {
  return new Response('unknown', {
    status: request.status,
    statusText: request.statusText,
    headers: stringToHeaders(request.getAllResponseHeaders()),
  })
}
