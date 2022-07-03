import { TextDecoder, TextEncoder } from 'web-encoding'

export function encodeBuffer(text: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(text)
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  )
}

export function decodeBuffer(buffer: ArrayBuffer, encoding?: string): string {
  const decoder = new TextDecoder(encoding)
  return decoder.decode(buffer)
}
