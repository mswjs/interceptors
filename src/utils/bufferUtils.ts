import { TextDecoder, TextEncoder } from 'web-encoding'

export function encodeBuffer(text: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(text)
  return getArrayBuffer(encoded)
}

export function decodeBuffer(buffer: ArrayBuffer, encoding?: string): string {
  const decoder = new TextDecoder(encoding)
  return decoder.decode(buffer)
}

export function getArrayBuffer(array: Uint8Array): ArrayBuffer {
  return array.buffer.slice(
    array.byteOffset,
    array.byteOffset + array.byteLength
  )
}
