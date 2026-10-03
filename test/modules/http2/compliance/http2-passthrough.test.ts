// @vitest-environment node
import http2 from 'node:http2'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('performs a request without any listeners as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(200, { 'x-original': 'yes' }).end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('x-original')).toBe('yes')
  await expect(response.text()).resolves.toBe('original-response')
})

it('performs a request the listeners did not handle as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe('original-response')
  expect(requestListener).toHaveBeenCalledOnce()
})

it('forwards the request method and path to the original server', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      response.end(`${request.method} ${request.url}`)
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':method': 'DELETE', ':path': '/users/123?force=true' })
  )

  await expect(response.text()).resolves.toBe('DELETE /users/123?force=true')
})

it('forwards the request headers to the original server', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      response.end(`${request.headers['x-custom-header']}`)
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/', 'x-custom-header': 'yes' })
  )

  await expect(response.text()).resolves.toBe('yes')
})

it('forwards the request body to the original server', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      request.pipe(response)
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('hello world')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('hello world')
})

it('forwards the request body the listener has read to the original server', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((request, response) => {
      request.pipe(response)
    })
  })

  const requestBodyListener = vi.fn<(body: string) => void>()
  interceptor.on('request', async ({ request }) => {
    requestBodyListener(await request.clone().text())
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('hello world')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('hello world')
  expect(requestBodyListener).toHaveBeenCalledExactlyOnceWith('hello world')
})

it('forwards a large original response body intact', async () => {
  const responseBody = 'a'.repeat(1024 * 1024)

  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end(responseBody)
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  const responseText = await response.text()

  expect(responseText.length).toBe(responseBody.length)
  expect(responseText === responseBody).toBe(true)
})

it('forwards the original response status', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(404).end('not-found')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(404)
  await expect(response.text()).resolves.toBe('not-found')
})

it('forwards an original response without a body', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.writeHead(204).end()
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  expect(response.status).toBe(204)
  expect(response.body).toBe(null)
})
