import { Response } from '@remix-run/web-fetch'
import { stringToHeaders } from 'headers-polyfill'

export function createResponse(
  request: XMLHttpRequest,
  responseBody: Uint8Array
): Response {
  // this fix will help to return Error when status is 0
  const {status} = request;
  const body = status === 0 ? 'Error' : responseBody;
  const req = status === 0 ? {...request, status: 500, statusText: 'Internal Server Error'} : request;
  return new Response(body, {
    status: req.status,
    statusText: req.statusText,
    headers: stringToHeaders(request.getAllResponseHeaders()),
  })
}
