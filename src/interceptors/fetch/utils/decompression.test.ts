// @vitest-environment node
import { brotliCompressSync } from 'node:zlib'
import { setTimeout } from 'node:timers/promises'
import { decompressResponse, isCompressedResponse } from './decompression'
import { BrotliDecompressionStream } from './brotli-decompress'

describe('isCompressedResponse', () => {
  it('returns false for a response without a body', () => {
    const response = new Response(null, {
      headers: { 'content-encoding': 'gzip' },
    })

    expect(isCompressedResponse(response)).toBe(false)
  })

  it('returns false for a response without "content-encoding"', () => {
    expect(isCompressedResponse(new Response('hello world'))).toBe(false)
  })

  it('returns false for a response with an empty "content-encoding"', () => {
    const response = new Response('hello world', {
      headers: { 'content-encoding': '' },
    })

    expect(isCompressedResponse(response)).toBe(false)
  })

  it('returns true for a response with a body and "content-encoding"', () => {
    const response = new Response('hello world', {
      headers: { 'content-encoding': 'gzip' },
    })

    expect(isCompressedResponse(response)).toBe(true)
  })
})

describe('decompressResponse', () => {
  it('throws when given a non-compressed response', () => {
    expect(() => {
      decompressResponse(new Response('hello world'))
    }).toThrow(/Failed to decompress a response/)
  })

  /**
   * @see https://github.com/mswjs/interceptors/issues/798
   * @note Node.js emits decompressed Brotli output in 16 KiB chunks.
   * A body larger than that must be decompressed in full, not truncated.
   */
  it('decompresses a "br" body larger than a single zlib chunk', async () => {
    const expectedBody = Array.from(
      { length: 10_000 },
      (_, index) => `line ${index}: ${crypto.randomUUID()}`
    ).join('\n')
    const response = new Response(brotliCompressSync(expectedBody), {
      headers: { 'content-encoding': 'br' },
    })

    const actualBody = await new Response(
      decompressResponse(response)
    ).text()

    expect(actualBody.length).toBe(expectedBody.length)
    expect(actualBody).toBe(expectedBody)
  })

  it('decompresses a "br" body streamed in multiple chunks', async () => {
    const expectedBody = Array.from(
      { length: 10_000 },
      (_, index) => `line ${index}: ${crypto.randomUUID()}`
    ).join('\n')
    const compressedBody = brotliCompressSync(expectedBody)
    const chunkSize = 1024
    const compressedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (
          let offset = 0;
          offset < compressedBody.byteLength;
          offset += chunkSize
        ) {
          controller.enqueue(
            new Uint8Array(compressedBody.subarray(offset, offset + chunkSize))
          )
        }
        controller.close()
      },
    })
    const response = new Response(compressedStream, {
      headers: { 'content-encoding': 'br' },
    })

    const actualBody = await new Response(
      decompressResponse(response)
    ).text()

    expect(actualBody).toBe(expectedBody)
  })

  it('errors when given a corrupted "br" body', async () => {
    const response = new Response(new Uint8Array(16).fill(0xff), {
      headers: { 'content-encoding': 'br' },
    })

    await expect(
      new Response(decompressResponse(response)).text()
    ).rejects.toThrow()
  })
})

describe('BrotliDecompressionStream', () => {
  it('drops pending output once the readable side is cancelled', async () => {
    const compressedBody = brotliCompressSync(Buffer.alloc(200_000, 'a'))
    const stream = new BrotliDecompressionStream()
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    writer.write(new Uint8Array(compressedBody)).catch(() => {})
    // Read the first decompressed chunk while zlib still has output pending.
    await expect(reader.read()).resolves.toHaveProperty('done', false)

    await reader.cancel('consumer cancelled')

    // Pending zlib output must not be enqueued into the cancelled stream.
    // That would throw an uncaught "Invalid state" error, failing this test.
    await setTimeout(50)
  })

  it('settles a cancellation that happens during flush', async () => {
    const compressedBody = brotliCompressSync(Buffer.alloc(200_000, 'a'))
    const stream = new BrotliDecompressionStream()
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    writer.write(new Uint8Array(compressedBody)).catch(() => {})
    await expect(reader.read()).resolves.toHaveProperty('done', false)
    // Closing the writable side starts the flush.
    const closePromise = writer.close()

    // Cancelling during flush does not invoke the "cancel" callback.
    // The stream must still settle and must not enqueue pending output.
    await expect(reader.cancel('consumer cancelled')).resolves.toBeUndefined()
    // Per the Streams spec, the writable side errors with the cancel reason.
    await expect(closePromise).rejects.toBe('consumer cancelled')
    await setTimeout(50)
  })
})

