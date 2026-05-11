const encoder = new TextEncoder()

export function encodeBuffer(text: string): Uint8Array {
  return encoder.encode(text)
}

export function decodeBuffer(buffer: ArrayBuffer, encoding?: string): string {
  const decoder = new TextDecoder(encoding)
  return decoder.decode(buffer)
}

/**
 * Create an `ArrayBuffer` from the given `Uint8Array`.
 * Takes the byte offset into account to produce the right buffer
 * in the case when the buffer is bigger than the data view.
 */
export function toArrayBuffer(array: Uint8Array): ArrayBuffer {
  return array.buffer.slice(
    array.byteOffset,
    array.byteOffset + array.byteLength
  )
}

export function toBuffer(
  data: string | Buffer | Uint8Array<ArrayBufferLike>,
  encoding?: BufferEncoding
): Buffer {
  if (Buffer.isBuffer(data)) {
    return data
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data.buffer)
  }

  return Buffer.from(data, encoding)
}
