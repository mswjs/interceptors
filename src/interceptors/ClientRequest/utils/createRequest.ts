import type { NodeClientRequest } from '../NodeClientRequest'
import { toWebReadableStream } from '../../../utils/streamUtils'

/**
 * Creates a Fetch API `Request` instance from the given `http.ClientRequest`.
 */
export function createRequest(clientRequest: NodeClientRequest): Request {
  return new Request(clientRequest.url, {
    method: clientRequest.method,
    headers: getRequestHeaders(clientRequest),
    credentials: 'same-origin',
    body: getRequestBody(clientRequest),
    // @ts-ignore
    duplex: 'half',
  })
}

function getRequestHeaders(clientRequest: NodeClientRequest): Headers {
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

  return headers
}

function getRequestBody(
  clientRequest: NodeClientRequest
): ReadableStream | null {
  if (
    !clientRequest.method ||
    clientRequest.method === 'HEAD' ||
    clientRequest.method === 'GET'
  ) {
    return null
  }

  const readable = clientRequest['requestBodyStream']

  if (readable.readableLength === 0) {
    return null
  }

  return toWebReadableStream(readable)
}
