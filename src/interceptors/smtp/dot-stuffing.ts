export const CRLF = Buffer.from('\r\n')
export const DATA_TERMINATOR = Buffer.from('\r\n.\r\n')

const DOT = 0x2e

/**
 * Transform the message line-by-line, operating on bytes: the message
 * content is arbitrary binary (8BITMIME) and must not go through a
 * string decoding round-trip.
 */
function transformLines(
  message: Buffer,
  transformLine: (line: Buffer) => Array<Buffer>
): Buffer {
  const parts: Array<Buffer> = []
  let offset = 0

  while (offset <= message.length) {
    const lineEndIndex = message.indexOf(CRLF, offset)
    const lineEnd = lineEndIndex === -1 ? message.length : lineEndIndex
    const line = message.subarray(offset, lineEnd)

    if (parts.length > 0) {
      parts.push(CRLF)
    }
    parts.push(...transformLine(line))

    if (lineEndIndex === -1) {
      break
    }

    offset = lineEndIndex + 2
  }

  return Buffer.concat(parts)
}

/**
 * Undo the SMTP dot-stuffing: the sender doubles every line-leading
 * dot in the message so it cannot be confused with the end-of-data
 * terminator.
 * @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.2
 */
export function undoDotStuffing(message: Buffer): Buffer {
  return transformLines(message, (line) => {
    return [line[0] === DOT ? line.subarray(1) : line]
  })
}

/**
 * Apply the SMTP dot-stuffing: the inverse of `undoDotStuffing`,
 * used when sending a message to a real server.
 */
export function applyDotStuffing(message: Buffer): Buffer {
  return transformLines(message, (line) => {
    return line[0] === DOT ? [Buffer.from('.'), line] : [line]
  })
}
