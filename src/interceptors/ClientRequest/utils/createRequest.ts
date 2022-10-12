import { Request } from '@remix-run/web-fetch'
import { Headers } from 'headers-polyfill'
import type { NodeClientRequest } from '../NodeClientRequest'

/**
 * Creates a Fetch API `Request` instance from the given `http.ClientRequest`.
 */
export function createRequest(clientRequest: NodeClientRequest): Request {
  const headers = new Headers()

  const outgoingHeaders = clientRequest.getHeaders()
  for (const headerName in outgoingHeaders) {
    const headerValue = outgoingHeaders[headerName]

    if (!headerValue) {
      continue
    }

    const valuesList = Array.prototype.concat([], headerValue)
    for (const value of valuesList) {
      headers.append(headerName, value.toString())
    }
  }

  return new Request(clientRequest.url, {
    method: clientRequest.method || 'GET',
    headers,
    credentials: 'same-origin',
    body: clientRequest.requestBuffer,
  })
}
