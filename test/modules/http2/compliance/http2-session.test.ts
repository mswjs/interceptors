// @vitest-environment node
import http2 from 'node:http2'
import { once } from 'node:events'
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

it('emits the "connect" event on the session', async () => {
  await using session = connectHttp2Session('http://api.example.com')
  const connectListener = vi.fn()
  session.on('connect', connectListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
})

it('reports the session as not encrypted', async () => {
  await using session = connectHttp2Session('http://api.example.com')
  await once(session, 'connect')

  expect.soft(session.encrypted).toBe(false)
  expect.soft(session.alpnProtocol).toBe('h2c')
})

it('exposes the settings of the remote peer', async () => {
  await using session = connectHttp2Session('http://api.example.com')
  const [remoteSettings] = await once(session, 'remoteSettings')

  expect(remoteSettings).toEqual(session.remoteSettings)
  expect(session.remoteSettings.enablePush).toBe(true)
})

it('acknowledges the local settings of the session', async () => {
  await using session = connectHttp2Session('http://api.example.com', {
    settings: { initialWindowSize: 1024 },
  })
  const [localSettings] = await once(session, 'localSettings')

  expect(localSettings.initialWindowSize).toBe(1024)
})

it('responds to the pings sent over the session', async () => {
  await using session = connectHttp2Session('http://api.example.com')
  await once(session, 'connect')

  const pingPayload = Buffer.from('12345678')
  const pendingPing = Promise.withResolvers<Buffer>()
  session.ping(pingPayload, (error, _duration, payload) => {
    if (error) {
      pendingPing.reject(error)
      return
    }

    pendingPing.resolve(payload)
  })

  await expect(pendingPing.promise).resolves.toEqual(pingPayload)
})

it('emits the stream events in order for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const stream = session.request({ ':path': '/' })
  const events: Array<string> = []

  stream
    .on('response', () => events.push('response'))
    .on('data', () => events.push('data'))
    .on('end', () => events.push('end'))
    .on('close', () => events.push('close'))

  await once(stream, 'close')

  expect(events).toEqual(['response', 'data', 'end', 'close'])
})

it('emits the stream events in order for the original response', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.respond({ ':status': 200 })
      stream.end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const events: Array<string> = []

  stream
    .on('response', () => events.push('response'))
    .on('data', () => events.push('data'))
    .on('end', () => events.push('end'))
    .on('close', () => events.push('close'))

  await once(stream, 'close')

  expect(events).toEqual(['response', 'data', 'end', 'close'])
})

it('emits the stream events in order for the original response with trailers', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer().on('stream', (stream) => {
      stream.respond({ ':status': 200 }, { waitForTrailers: true })
      stream.once('wantTrailers', () => {
        stream.sendTrailers({ 'x-status': 'done' })
      })
      stream.end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const stream = session.request({ ':path': '/' })
  const events: Array<string> = []

  stream
    .on('response', () => events.push('response'))
    .on('data', () => events.push('data'))
    .on('trailers', () => events.push('trailers'))
    .on('end', () => events.push('end'))
    .on('close', () => events.push('close'))

  await once(stream, 'close')

  expect(events).toEqual(['response', 'data', 'trailers', 'end', 'close'])
})

it('closes the session gracefully', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const session = http2.connect('http://api.example.com')
  const closeListener = vi.fn()
  session.on('close', closeListener)

  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
  await expect(response.text()).resolves.toBe('hello world')

  session.close()

  await expect.poll(() => closeListener).toHaveBeenCalledOnce()
})

it('establishes a new session after the previous one is destroyed', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(new URL(request.url).pathname))
  })

  {
    await using session = connectHttp2Session('http://api.example.com')
    const response = await toHttp2WebResponse(
      session.request({ ':path': '/one' })
    )
    await expect(response.text()).resolves.toBe('/one')
  }

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/two' })
  )
  await expect(response.text()).resolves.toBe('/two')
})
