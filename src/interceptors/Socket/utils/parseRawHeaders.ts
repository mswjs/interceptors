/**
 * Create a Fetch API `Headers` instance from the given raw headers list.
 */
export function parseRawHeaders(rawHeaders: Array<string>): Headers {
  const headers = new Headers()
  for (let line = 0; line < rawHeaders.length; line += 2) {
    headers.append(rawHeaders[line], rawHeaders[line + 1])
  }
  return headers
}
