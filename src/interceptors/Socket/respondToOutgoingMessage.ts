import {
  type IncomingHttpHeaders,
  IncomingMessage,
  OutgoingMessage,
} from 'node:http'
import { Readable } from 'node:stream'
import { getRawFetchHeaders } from '../../utils/getRawFetchHeaders'

export function respondToOutgoingMessage(
  outgoing: OutgoingMessage,
  response: Response
): void {
  const incoming = new IncomingMessage(outgoing.socket!)

  incoming.statusCode = response.status
  incoming.statusMessage = response.statusText

  const rawHeaders = getRawFetchHeaders(response.headers) || response.headers

  if (rawHeaders) {
    rawHeaders.forEach((headerValue, headerName) => {
      incoming.rawHeaders.push(headerName, headerValue)

      const insensitiveHeaderName = headerName.toLowerCase()
      const prevHeaders = incoming.headers[insensitiveHeaderName]
      incoming.headers[insensitiveHeaderName] = prevHeaders
        ? Array.prototype.concat([], prevHeaders, headerValue)
        : headerValue
    })
  }

  Reflect.set(outgoing, 'res', incoming)
  outgoing.emit('response', incoming)

  const finishResponseStream = () => {
    incoming.push(null)
    incoming.complete = true
    incoming.emit('end')

    if ('agent' in outgoing && outgoing.agent) {
      // @ts-ignore
      outgoing.agent.destroy()
    }
  }

  if (response.body) {
    const reader = response.body.getReader()

    const readNextChunk = async (): Promise<void> => {
      const { done, value } = await reader.read()

      if (done) {
        finishResponseStream()
        return
      }

      incoming.emit('data', value)
      return readNextChunk()
    }

    readNextChunk()
  } else {
    finishResponseStream()
  }
}

export function responseFromIncomingMessage(
  incoming: IncomingMessage
): Response {
  return new Response(Readable.toWeb(incoming), {
    status: incoming.statusCode,
    statusText: incoming.statusMessage,
    headers: headersFromIncomingHeaders(incoming.headers),
  })
}

function headersFromIncomingHeaders(
  incomingHeaders: IncomingHttpHeaders
): Headers {
  const headers = new Headers()

  for (const headerName in incomingHeaders) {
    const headerValues = Array.prototype.concat(incomingHeaders[headerName])

    for (const headerValue of headerValues) {
      headers.append(headerName, headerValue)
    }
  }

  return headers
}
