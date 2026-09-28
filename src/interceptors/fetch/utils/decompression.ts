// Import from an internal alias that resolves to different modules
// depending on the environment. This way, we can keep the fetch interceptor
// intact while using different strategies for Brotli decompression.
import { invariant } from 'outvariant'
import { BrotliDecompressionStream } from 'internal:brotli-decompress'

class PipelineStream extends TransformStream {
  constructor(
    transformStreams: Array<TransformStream>,
    ...strategies: Array<QueuingStrategy>
  ) {
    super({}, ...strategies)

    const readable = [super.readable as any, ...transformStreams].reduce(
      (readable, transform) => readable.pipeThrough(transform)
    )

    Object.defineProperty(this, 'readable', {
      get() {
        return readable
      },
    })
  }
}

export function parseContentEncoding(contentEncoding: string): Array<string> {
  return contentEncoding
    .toLowerCase()
    .split(',')
    .map((coding) => coding.trim())
}

function createDecompressionStream(
  contentEncoding: string
): TransformStream {
  const codings = parseContentEncoding(contentEncoding)

  const transformers = codings.reduceRight<Array<TransformStream>>(
    (transformers, coding) => {
      if (coding === 'gzip' || coding === 'x-gzip') {
        return transformers.concat(new DecompressionStream('gzip'))
      } else if (coding === 'deflate') {
        return transformers.concat(new DecompressionStream('deflate'))
      } else if (coding === 'br') {
        return transformers.concat(new BrotliDecompressionStream())
      } else {
        transformers.length = 0
      }

      return transformers
    },
    []
  )

  return new PipelineStream(transformers)
}

interface CompressedResponse extends Response {
  body: NonNullable<Response['body']>
}

/**
 * Returns a boolean indicating whether the given response
 * has a body encoded with a non-empty "content-encoding".
 */
export function isCompressedResponse(
  response: Response
): response is CompressedResponse {
  if (response.body === null) {
    return false
  }

  const contentEncoding = response.headers.get('content-encoding')

  return contentEncoding !== null && contentEncoding.trim() !== ''
}

/**
 * Decompresses the body of the given compressed response.
 */
export function decompressResponse(response: Response): ReadableStream {
  invariant(
    isCompressedResponse(response),
    'Failed to decompress a response: expected a response with a body and a non-empty "content-encoding" header'
  )

  // The header is guaranteed to be present by the invariant above.
  const contentEncoding = response.headers.get('content-encoding')!
  const decompressionStream = createDecompressionStream(contentEncoding)

  // Use `pipeTo` and return the decompression stream's readable
  // instead of `pipeThrough` because that will lock the original
  // response stream, making it unusable as the input to Response.
  response.body.pipeTo(decompressionStream.writable)
  return decompressionStream.readable
}
