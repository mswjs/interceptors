import type { Readable } from 'stream'

export function toWebReadableStream(readable: Readable): ReadableStream {
  const stream = new ReadableStream({
    start(controller) {
      readable.on('data', (chunk) => controller.enqueue(chunk))
      readable.on('error', (error) => controller.error(error))
      readable.on('end', () => controller.close())
    },
  })

  return stream
}
