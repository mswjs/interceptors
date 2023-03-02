import { stringToHeaders } from 'headers-polyfill'

export function createResponse(
  request: XMLHttpRequest,
  responseBody: BodyInit | null
): Response {
  return new Response(responseBody, {
    status: request.status,
    statusText: request.statusText,
    headers: stringToHeaders(request.getAllResponseHeaders()),
  })
}
