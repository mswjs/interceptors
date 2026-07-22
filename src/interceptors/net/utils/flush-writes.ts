import net from 'node:net'

/**
 * Write the given pending data to the socket using its public
 * "write()" method. Unlike direct "_writeGeneric()" calls, public
 * writes go through the "Writable" queue that only dispatches the
 * next write once the previous one completes. TLS sockets rely on
 * that serialization: their "TLSWrap" handle supports a single
 * write in flight and crashes the process with a native
 * "Assertion failed: !current_write_" abort when writes overlap
 * (e.g. multiple direct "_writeGeneric()" calls issued on a
 * connecting socket replay back-to-back on "connect").
 */
export function writePendingData(
  socket: net.Socket,
  data: NonNullable<net.Socket['_pendingData']>,
  encoding: BufferEncoding,
  callback?: (error?: Error | null) => void
): void {
  if (Array.isArray(data)) {
    for (let index = 0; index < data.length; index++) {
      const entry = data[index]
      const isLastEntry = index === data.length - 1

      /**
       * @note Per-entry callbacks are intentionally ignored, the same
       * way "writevGeneric()" only honors the batch-level callback.
       */
      if (isLastEntry) {
        socket.write(entry.chunk, entry.encoding, callback)
      } else {
        socket.write(entry.chunk, entry.encoding)
      }
    }

    return
  }

  socket.write(data, encoding, callback)
}

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
