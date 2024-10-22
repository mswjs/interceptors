export class BrotliDecompressionStream extends TransformStream {
  constructor() {
    super({
      start() {
        console.warn(
          '[Interceptors] Brotli decompression is not supported in the browser'
        )
      },
    })
  }
}
