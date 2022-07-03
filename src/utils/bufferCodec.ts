export function encodeBuf(input: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(input)
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  )
}

export function decodeBuf(input: ArrayBuffer): string {
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(input)
}
