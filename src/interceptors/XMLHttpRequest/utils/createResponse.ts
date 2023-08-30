/**
 * Creates a Fetch API `Response` instance from the given
 * `XMLHttpRequest` instance and a response body.
 */
export function createResponse(
  request: XMLHttpRequest,
  body: BodyInit | null
): Response {
  return new Response(body, {
    status: request.status,
    statusText: request.statusText,
    headers: createHeadersFromXMLHttpReqestHeaders(
      request.getAllResponseHeaders()
    ),
  })
}

function createHeadersFromXMLHttpReqestHeaders(headersString: string): Headers {
  const headers = new Headers()

  const lines = headersString.split(/[\r\n]+/)
  for (const line of lines) {
    if (line.trim() === '') {
      continue
    }

    const [name, ...parts] = line.split(': ')
    const value = parts.join(': ')

    headers.append(name, value)
  }

  return headers
}
