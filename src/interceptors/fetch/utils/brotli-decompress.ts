import zlib from 'node:zlib'
import type { Transformer } from 'node:stream/web'

export class BrotliDecompressionStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor() {
    const decompress = zlib.createBrotliDecompress({
      flush: zlib.constants.BROTLI_OPERATION_FLUSH,
      finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
    })

    /**
     * @note Typed via Node.js as the DOM `Transformer` type
     * does not declare the `cancel` callback yet.
     */
    const transformer: Transformer<Uint8Array, Uint8Array> = {
      start(controller) {
        /**
         * @note Forward every decompressed chunk to the stream.
         * A single input chunk can produce multiple output chunks
         * (Node.js emits Brotli output in 16 KiB chunks by default).
         * @see https://github.com/mswjs/interceptors/issues/798
         */
        decompress.on('data', (chunk: Buffer) => {
          // Ignore any in-flight output once the consumer cancelled the stream.
          if (decompress.destroyed) {
            return
          }

          try {
            controller.enqueue(new Uint8Array(chunk))
          } catch {
            /**
             * @note The readable side has been cancelled. If that happens
             * after `flush()` has started, the `cancel()` callback is never
             * invoked (per the Streams spec), so stop decompression here.
             */
            decompress.destroy()
          }
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
        // Settle the flush if decompression is stopped by a cancellation.
        decompress.once('close', flushPromise.resolve)
        decompress.once('error', flushPromise.reject)
        decompress.end()

        return flushPromise.promise
      },
      cancel() {
        /**
         * @note Release the zlib handle once the consumer cancels
         * the readable side. Nothing can be enqueued into a cancelled
         * stream, so any pending decompression output must be dropped.
         */
        decompress.destroy()
      },
    }

    super(transformer)
  }
}
