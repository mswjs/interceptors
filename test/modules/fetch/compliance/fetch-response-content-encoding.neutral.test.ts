import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

/**
 * @note Brotli compression is tested only in Node.js.
 * There is no `CompressionStream` support for Brotli to produce
 * compressed mocked responses in the browser, and the browser
 * interceptor does not support Brotli decompression of mocked responses.
 */
const IS_BROWSER = typeof window !== 'undefined'

const server = getTestServer()
const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('decompresses a mocked "content-encoding: gzip" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new Blob(['hello world'])
          .stream()
          .pipeThrough(new CompressionStream('gzip')),
        {
          headers: { 'content-encoding': 'gzip' },
        }
      )
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).resolves.toBe('hello world')
})

it('decompresses a bypassed "content-encoding: gzip" response body', async () => {
  const response = await fetch(server.http.url('/compressed'), {
    headers: { 'x-accept-encoding': 'gzip' },
  })
  await expect(response.text()).resolves.toBe('hello world')
})

it('decompresses a mocked "content-encoding: x-gzip" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new Blob(['hello world'])
          .stream()
          .pipeThrough(new CompressionStream('gzip')),
        {
          headers: { 'content-encoding': 'x-gzip' },
        }
      )
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).resolves.toBe('hello world')
})

it('decompresses a bypassed "content-encoding: x-gzip" response body', async () => {
  const response = await fetch(server.http.url('/compressed'), {
    headers: { 'x-accept-encoding': 'x-gzip' },
  })
  await expect(response.text()).resolves.toBe('hello world')
})

it('decompresses a mocked "content-encoding: deflate" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new Blob(['hello world'])
          .stream()
          .pipeThrough(new CompressionStream('deflate')),
        {
          headers: { 'content-encoding': 'deflate' },
        }
      )
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).resolves.toBe('hello world')
})

it('decompresses a bypassed "content-encoding: deflate" response body', async () => {
  const response = await fetch(server.http.url('/compressed'), {
    headers: { 'x-accept-encoding': 'deflate' },
  })
  await expect(response.text()).resolves.toBe('hello world')
})

it.skipIf(IS_BROWSER)(
  'decompresses a mocked "content-encoding: br" response body',
  async () => {
    const { brotliCompressSync } = await import('node:zlib')

    interceptor.on('request', ({ controller }) => {
      controller.respondWith(
        new Response(brotliCompressSync('hello world'), {
          headers: { 'content-encoding': 'br' },
        })
      )
    })

    const response = await fetch('http://localhost/resource')
    await expect(response.text()).resolves.toBe('hello world')
  }
)

it.skipIf(IS_BROWSER)(
  'decompresses a bypassed "content-encoding: br" response body',
  async () => {
    const response = await fetch(server.http.url('/compressed'), {
      headers: { 'x-accept-encoding': 'br' },
    })
    await expect(response.text()).resolves.toBe('hello world')
  }
)

it('decompresses a mocked "content-encoding: gzip, deflate" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(
        new Blob(['hello world'])
          .stream()
          .pipeThrough(new CompressionStream('gzip'))
          .pipeThrough(new CompressionStream('deflate')),
        {
          headers: { 'content-encoding': 'gzip, deflate' },
        }
      )
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).resolves.toBe('hello world')
})

/**
 * Undici throws an error decompressing a "gzip, deflate" response.
 * @see https://github.com/nodejs/undici/issues/3762
 */
it.skip('decompresses a bypassed "content-encoding: gzip, deflate" response body', async () => {
  const response = await fetch(server.http.url('/compressed'), {
    headers: { 'x-accept-encoding': 'gzip, deflate' },
  })
  await expect(response.text()).resolves.toBe('hello world')
})

it.skipIf(IS_BROWSER)(
  'decompresses a mocked "content-encoding: gzip, br" response body',
  async () => {
    const { brotliCompressSync, gzipSync } = await import('node:zlib')

    interceptor.on('request', ({ controller }) => {
      controller.respondWith(
        new Response(brotliCompressSync(gzipSync('hello world')), {
          headers: { 'content-encoding': 'gzip, br' },
        })
      )
    })

    const response = await fetch('http://localhost/resource')
    await expect(response.text()).resolves.toBe('hello world')
  }
)

/**
 * Undici throws an error decompressing a "gzip, br" response.
 * @see https://github.com/nodejs/undici/issues/3762
 */
it.skip('decompresses a bypassed "content-encoding: gzip, br" response body', async () => {
  const response = await fetch(server.http.url('/compressed'), {
    headers: { 'x-accept-encoding': 'gzip, br' },
  })
  await expect(response.text()).resolves.toBe('hello world')
})

/**
 * @note In Node.js, reading a mocked response body that fails
 * decompression currently hangs instead of rejecting. Undici rejects
 * such bodies when they are received from an actual server, but not
 * when the decompression error interrupts an in-flight mocked message.
 * @todo Support this scenario in Node.js.
 */
it.skipIf(!IS_BROWSER)('throws error if decompression failed', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'content-encoding': 'gzip',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).rejects.toThrow()
})
