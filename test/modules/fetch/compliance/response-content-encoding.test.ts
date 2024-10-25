// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { compressResponse } from '../../../helpers'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { parseContentEncoding } from '../../../../src/interceptors/fetch/utils/decompression'

const httpServer = new HttpServer((app) => {
  app.get('/compressed', (req, res) => {
    const acceptEncoding = req.header('accept-encoding')
    const codings = parseContentEncoding(acceptEncoding || '') as any[]

    res
      .set('content-encoding', acceptEncoding)
      .end(compressResponse(codings, 'hello world'))
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
      new Response(compressResponse(['gzip'], 'hello world'), {
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
      new Response(compressResponse(['gzip'], 'hello world'), {
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
      new Response(compressResponse(['deflate'], 'hello world'), {
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
      new Response(compressResponse(['br'], 'hello world'), {
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

it('decompresses a mocked "content-encoding: gzip, deflate" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(compressResponse(['gzip', 'deflate'], 'hello world'), {
        headers: {
          'content-encoding': 'gzip, deflate',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

/**
 * Undici throws an error decompressing a "gzip, deflate" response.
 * @see https://github.com/nodejs/undici/issues/3762
 */
it.skip('decompresses a bypassed "content-encoding: gzip, deflate" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'gzip, deflate' },
  })
  expect(await response.text()).toBe('hello world')
})

it('decompresses a mocked "content-encoding: gzip, br" response body', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(compressResponse(['gzip', 'br'], 'hello world'), {
        headers: {
          'content-encoding': 'gzip, br',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  expect(await response.text()).toBe('hello world')
})

/**
 * Undici throws an error decompressing a "gzip, br" response.
 * @see https://github.com/nodejs/undici/issues/3762
 */
it.skip('decompresses a bypassed "content-encoding: gzip, br" response body', async () => {
  const response = await fetch(httpServer.http.url('/compressed'), {
    headers: { 'accept-encoding': 'gzip, br' },
  })
  expect(await response.text()).toBe('hello world')
})

it('throws error if decompression failed', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'content-encoding': 'br',
        },
      })
    )
  })

  const response = await fetch('http://localhost/resource')
  await expect(response.text()).rejects.toThrowError('Decompression failed')
})
