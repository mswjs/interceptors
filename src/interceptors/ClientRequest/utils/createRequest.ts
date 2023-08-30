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

  const method = clientRequest.method || 'GET'

  return new Request(clientRequest.url, {
    method,
    headers,
    credentials: 'same-origin',
    body:
      method === 'HEAD' || method === 'GET'
        ? null
        : clientRequest.requestBuffer,
  })
}
