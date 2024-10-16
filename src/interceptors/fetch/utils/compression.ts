function pipeline(streams: Array<TransformStream>): TransformStream {
  if (streams.length === 0) {
    throw new Error('At least one stream must be provided')
  }

  let composedStream = streams[0]

  for (let i = 1; i < streams.length; i++) {
    const currentStream = streams[i]

    composedStream = new TransformStream({
      async start(controller) {
        const reader = streams[i - 1].readable.getReader()
        const writer = currentStream.writable.getWriter()

        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }
          await writer.write(value)
        }

        await writer.close()
        controller.terminate()
      },
      transform(chunk, controller) {
        controller.enqueue(chunk)
      },
    })
  }

  return composedStream
}

function createDecompressionStream(
  contentEncoding: string
): TransformStream | null {
  if (contentEncoding === '') {
    return null
  }

  const codings = contentEncoding
    .toLowerCase()
    .split(',')
    .map((coding) => coding.trim())

  if (codings.length === 0) {
    return null
  }

  const transformers: Array<TransformStream> = []

  for (let i = codings.length - 1; i >= 0; --i) {
    const coding = codings[i]

    if (coding === 'gzip' || coding === 'x-gzip') {
      transformers.push(new DecompressionStream('gzip'))
    } else if (coding === 'deflate') {
      transformers.push(new DecompressionStream('deflate'))
    } else if (coding === 'br') {
      /**
       * @todo Support Brotli decompression.
       * It's not a part of the web Compression Streams API.
       */
    } else {
      transformers.length = 0
    }
  }

  return pipeline(transformers)
}

export function decompressResponse(
  response: Response
): ReadableStream<any> | null {
  if (response.body === null) {
    return null
  }

  const decompressionStream = createDecompressionStream(
    response.headers.get('content-encoding') || ''
  )

  if (!decompressionStream) {
    return null
  }

  // Use `pipeTo` and return the decompression stream's readable
  // instead of `pipeThrough` because that will lock the original
  // response stream, making it unusable as the input to Response.
  response.body.pipeTo(decompressionStream.writable)
  return decompressionStream.readable
}
