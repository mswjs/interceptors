export function toBuffer(data: any, encoding?: BufferEncoding): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data, encoding)
}
