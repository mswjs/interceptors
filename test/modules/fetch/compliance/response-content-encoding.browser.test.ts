import { HttpServer } from '@open-draft/test-server/http'
import { test, expect } from '../../../playwright.extend'
import { compressResponse, useCors } from '../../../helpers'
import { parseContentEncoding } from '../../../../src/interceptors/fetch/utils/decompression'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

declare namespace window {
  const interceptor: FetchInterceptor
}

const server = new HttpServer((app) => {
  app.use(useCors)
  app.get('/resource', (req, res) => {
    const acceptEncoding = req.header('x-accept-encoding')
    const codings = parseContentEncoding(acceptEncoding || '') as any[]

    res
      .set('content-encoding', acceptEncoding)
      .end(compressResponse(codings, 'hello world'))
  })
})

test.beforeAll(async () => {
  await server.listen()
})

test.afterAll(async () => {
  await server.close()
})

test('decompresses a mocked "content-encoding: gzip" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello world'))
          controller.close()
        },
      })

      return controller.respondWith(
        new Response(stream.pipeThrough(new CompressionStream('gzip')), {
          headers: { 'content-encoding': 'gzip' },
        })
      )
    })
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return response.text()
  }, 'http://localhost/resource')

  expect(responseText).toBe('hello world')
})

test('decompresses a bypassed "content-encoding: gzip" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      /**
       * @note `accept-encoding` is a forbidden browser header.
       * Setting it will have no effect. Instead, rely on a custom header
       * to communicate the expected encoding to the test server.
       */
      headers: { 'x-accept-encoding': 'gzip' },
    })
    return response.text()
  }, server.http.url('/resource'))

  expect(responseText).toBe('hello world')
})

test('decompresses a mocked "content-encoding: x-gzip" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello world'))
          controller.close()
        },
      })

      return controller.respondWith(
        new Response(stream.pipeThrough(new CompressionStream('gzip')), {
          headers: { 'content-encoding': 'x-gzip' },
        })
      )
    })
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return response.text()
  }, 'http://localhost/resource')

  expect(responseText).toBe('hello world')
})

test('decompresses a bypassed "content-encoding: x-gzip" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      headers: { 'x-accept-encoding': 'x-gzip' },
    })
    return response.text()
  }, server.http.url('/resource'))

  expect(responseText).toBe('hello world')
})

test('decompresses a mocked "content-encoding: deflate" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.on('request', ({ controller }) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello world'))
          controller.close()
        },
      })

      return controller.respondWith(
        new Response(stream.pipeThrough(new CompressionStream('deflate')), {
          headers: { 'content-encoding': 'deflate' },
        })
      )
    })
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return response.text()
  }, 'http://localhost/resource')

  expect(responseText).toBe('hello world')
})

test('decompresses a bypassed "content-encoding: deflate" response body', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../fetch.runtime.js'))

  await page.evaluate(() => {
    window.interceptor.apply()
  })

  const responseText = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      headers: { 'x-accept-encoding': 'deflate' },
    })
    return response.text()
  }, server.http.url('/resource'))

  expect(responseText).toBe('hello world')
})
