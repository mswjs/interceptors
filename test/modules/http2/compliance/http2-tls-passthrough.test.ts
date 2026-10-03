// @vitest-environment node
import http2 from 'node:http2'
import https from 'node:https'
import { once } from 'node:events'
import { Agent, fetch } from 'undici'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
  toWebResponse,
} from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

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

it('performs an HTTP/2 request over TLS as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createSecureServer(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (_request, response) => {
        response.end('original-response')
      }
    )
  })

  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await using session = connectHttp2Session(server.https.url('/'), {
    ca: TLS_CERTIFICATE,
  })
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('original-response')
  expect(requestListener).not.toHaveBeenCalled()
})

it('preserves the TLS state of a session connected over TLS', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createSecureServer({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  await using session = connectHttp2Session(server.https.url('/'), {
    ca: TLS_CERTIFICATE,
  })
  await once(session, 'connect')

  expect.soft(session.encrypted).toBe(true)
  expect.soft(session.alpnProtocol).toBe('h2')
  expect.soft(session.socket.remotePort).toBe(server.port)
})

it('performs a fetch request negotiating HTTP/2 as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createSecureServer(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (request, response) => {
        response.end(`original-response:${request.httpVersion}`)
      }
    )
  })

  const dispatcher = new Agent({
    allowH2: true,
    connect: { ca: TLS_CERTIFICATE },
  })
  onTestFinished(async () => {
    await dispatcher.destroy()
  })

  const response = await fetch(server.https.url('/'), { dispatcher })

  await expect(response.text()).resolves.toBe('original-response:2.0')
})

it('performs an HTTPS request as-is', async () => {
  await using server = await createRawTestServer(() => {
    return https.createServer(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (_request, response) => {
        response.end('original-response')
      }
    )
  })

  const request = https.get(server.https.url('/'), {
    ca: TLS_CERTIFICATE,
    agent: false,
  })
  const [response] = await toWebResponse(request)

  await expect(response.text()).resolves.toBe('original-response')
})
