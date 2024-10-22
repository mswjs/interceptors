// @vitest-environment node
import zlib from 'node:zlib'
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { parseContentEncoding } from '../../../../src/interceptors/fetch/utils/decompression'

function compose(...fns: Array<Function>) {
  return fns.reduce((f, g) => {
    return (...args: Array<unknown>) => f(g(...args))
  })
}

function compress(codings: Array<string>) {
  return compose(
    ...codings.map((coding) => {
      if (coding === 'gzip' || coding === 'x-gzip') {
        return zlib.gzipSync
      } else if (coding === 'deflate') {
        return zlib.deflateSync
      } else if (coding === 'br') {
        return zlib.brotliCompressSync
      }

      return (data: string) => data
    })
  )
}

const httpServer = new HttpServer((app) => {
  app.get('/compressed', (req, res) => {
    const acceptEncoding = req.header('accept-encoding')
    const codings = parseContentEncoding(acceptEncoding || '')

    res
      .set('content-encoding', acceptEncoding)
      .end(compress(codings)('hello world'))
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('decompresses a mocked "content-encoding: gzip" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(zlib.gzipSync('hello world'), {
        headers: {
          'content-encoding': 'gzip',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: gzip" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'gzip' },
  })
  expect(await response.text()).toBe('hello world')
})

it('decompresses a mocked "content-encoding: x-gzip" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(zlib.gzipSync('hello world'), {
        headers: {
          'content-encoding': 'x-gzip',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: x-gzip" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'x-gzip' },
  })
  expect(await response.text()).toBe('hello world')
})

it('decompresses a mocked "content-encoding: deflate" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(zlib.deflateSync('hello world'), {
        headers: {
          'content-encoding': 'deflate',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: deflate" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'deflate' },
  })
  expect(await response.text()).toBe('hello world')
})

it('decompresses a mocked "content-encoding: br" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(zlib.brotliCompressSync('hello world'), {
        headers: {
          'content-encoding': 'br',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: br" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'br' },
  })
  expect(await response.text()).toBe('hello world')
})

it('decompresses a mocked "content-encoding: gzip, br" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(compress(['gzip', 'br'])('hello world'), {
        headers: {
          'content-encoding': 'gzip, br',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

it('decompresses a bypassed "content-encoding: gzip, br" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'))
  expect(await response.text()).toBe('hello world')
})
