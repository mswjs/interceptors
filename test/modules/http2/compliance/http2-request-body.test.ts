// @vitest-environment node
import { once } from 'node:events'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { connectHttp2Session, toHttp2WebResponse } from '#/test/helpers'

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

it('exposes a text request body', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    controller.respondWith(new Response(await request.text()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('hello world')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('hello world')
})

it('exposes a JSON request body', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    controller.respondWith(Response.json(await request.json()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({
    ':method': 'POST',
    ':path': '/',
    'content-type': 'application/json',
  })
  stream.end(JSON.stringify({ id: 1, name: 'John' }))
  const response = await toHttp2WebResponse(stream)

  await expect(response.json()).resolves.toEqual({ id: 1, name: 'John' })
})

it('exposes a binary request body', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    controller.respondWith(new Response(await request.arrayBuffer()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end(Buffer.from([0, 1, 2, 253, 254, 255]))
  const response = await toHttp2WebResponse(stream)

  await expect(response.arrayBuffer()).resolves.toEqual(
    Uint8Array.from([0, 1, 2, 253, 254, 255]).buffer
  )
})

it('exposes a request body written in multiple chunks', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    controller.respondWith(new Response(await request.text()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.write('one,')
  stream.write('two,')
  stream.end('three')
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe('one,two,three')
})

it('exposes a request body larger than the flow control window', async () => {
  const requestBody = 'a'.repeat(1024 * 1024)
  interceptor.on('request', async ({ request, controller }) => {
    const requestText = await request.text()
    controller.respondWith(new Response(requestText.length.toString()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end(requestBody)
  const response = await toHttp2WebResponse(stream)

  await expect(response.text()).resolves.toBe(requestBody.length.toString())
})

it('exposes an empty body for a request ended without data', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    controller.respondWith(Response.json({ body: await request.text() }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end()
  const response = await toHttp2WebResponse(stream)

  await expect(response.json()).resolves.toEqual({ body: '' })
})

it('exposes no body for a request without one', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(Response.json({ hasBody: request.body != null }))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.json()).resolves.toEqual({ hasBody: false })
})

it('responds to a request the client has not finished sending', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.write('unfinished')

  const chunks: Array<string> = []
  stream.setEncoding('utf8').on('data', (chunk) => chunks.push(chunk))
  await once(stream, 'close')

  expect(chunks.join('')).toBe('hello world')
})
