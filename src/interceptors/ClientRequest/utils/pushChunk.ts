export function pushChunk(
  target: Buffer,
  chunk: Buffer | string | null,
  encoding?: BufferEncoding | null
): Buffer {
  if (!chunk) {
    return target
  }

  const chunkBuffer = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk, encoding || undefined)

  return Buffer.concat([target, chunkBuffer])
}
