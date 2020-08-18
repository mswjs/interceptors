import { ClientRequest, OutgoingHttpHeaders } from 'http'

export function inheritRequestHeaders(
  req: ClientRequest,
  headers: OutgoingHttpHeaders | undefined
): void {
  // Cannot write request headers once already written,
  // or when no headers are given.
  if (req.headersSent || !headers) {
    return
  }

  Object.entries(headers).forEach(([name, value]) => {
    if (value != null) {
      req.setHeader(name, value)
    }
  })
}
