import { TextDecoder, TextEncoder } from 'web-encoding'

const encoder = new TextEncoder()

export function encodeBuffer(text: string): Uint8Array {
  return encoder.encode(text)
}

export function decodeBuffer(buffer: ArrayBuffer, encoding?: string): string {
  const decoder = new TextDecoder(encoding)
  return decoder.decode(buffer)
}
