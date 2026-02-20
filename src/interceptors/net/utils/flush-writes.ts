import net from 'node:net'

export function unwrapPendingData(
  data: NonNullable<net.Socket['_pendingData']>,
  callback: (
    chunk: string | Buffer,
    encoding?: BufferEncoding,
    callback?: (error?: Error | null) => void
  ) => void
) {
  if (Array.isArray(data)) {
    for (const entry of data) {
      callback(entry.chunk, entry.encoding, entry.callback)
    }
  } else {
    callback(data)
  }
}
