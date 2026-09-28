import zlib from 'node:zlib'

export class BrotliDecompressionStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor() {
    const decompress = zlib.createBrotliDecompress({
      flush: zlib.constants.BROTLI_OPERATION_FLUSH,
      finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
    })

    super({
      start(controller) {
        /**
         * @note Forward every decompressed chunk to the stream.
         * A single input chunk can produce multiple output chunks
         * (Node.js emits Brotli output in 16 KiB chunks by default).
         * @see https://github.com/mswjs/interceptors/issues/798
         */
        decompress.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        decompress.once('error', (error) => {
          controller.error(error)
        })
      },
      transform(chunk) {
        const writePromise = Promise.withResolvers<void>()

        decompress.write(chunk, (error) => {
          if (error) {
            writePromise.reject(error)
          } else {
            writePromise.resolve()
          }
        })

        return writePromise.promise
      },
      flush() {
        const flushPromise = Promise.withResolvers<void>()

        decompress.once('end', flushPromise.resolve)
        decompress.once('error', flushPromise.reject)
        decompress.end()

        return flushPromise.promise
      },
    })
  }
}
