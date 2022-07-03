import { TextDecoder, TextEncoder } from 'web-encoding'

export function encodeBuf(input: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(input)
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  )
}

export function decodeBuf(input: ArrayBuffer, encoding?: string): string {
  const decoder = new TextDecoder(encoding)
  return decoder.decode(input)
}
