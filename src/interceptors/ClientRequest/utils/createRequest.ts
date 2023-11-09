import type { NodeClientRequest } from '../NodeClientRequest'
import { FORBIDDEN_REQUEST_METHODS } from '../../../utils/fetchUtils'

/**
 * Creates a Fetch API `Request` instance from the given `http.ClientRequest`.
 */
export function createRequest(clientRequest: NodeClientRequest): Request {
  const headers = new Headers()

  const outgoingHeaders = clientRequest.getHeaders()
  for (const headerName in outgoingHeaders) {
    const headerValue = outgoingHeaders[headerName]

    if (typeof headerValue === 'undefined') {
      continue
    }

    const valuesList = Array.prototype.concat([], headerValue)
    for (const value of valuesList) {
      headers.append(headerName, value.toString())
    }
  }

  /**
   * Translate the authentication from the request URL to
   * the request "Authorization" header.
   * @see https://github.com/mswjs/interceptors/issues/438
   */
  if (clientRequest.url.username || clientRequest.url.password) {
    const auth = `${clientRequest.url.username || ''}:${
      clientRequest.url.password || ''
    }`
    headers.set('Authorization', `Basic ${btoa(auth)}`)

    // Remove the credentials from the URL since you cannot
    // construct a Request instance with such a URL.
    clientRequest.url.username = ''
    clientRequest.url.password = ''
  }

  const method = clientRequest.method || 'GET'

  const fetchRequest = new Request(clientRequest.url, {
    method: FORBIDDEN_REQUEST_METHODS.includes(method)
      ? `UNSAFE-${method}`
      : method,
    headers,
    credentials: 'same-origin',
    body: ['HEAD', 'GET'].includes(method) ? null : clientRequest.requestBuffer,
  })

  if (fetchRequest.method.startsWith('UNSAFE-')) {
    Object.defineProperty(fetchRequest, 'method', {
      value: fetchRequest.method.replace('UNSAFE-', ''),
    })
  }

  return fetchRequest
}
