// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/853
 */
import http2 from 'node:http2'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('passes through an HTTP/2 connection', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('original-response')
})

it('passes through an HTTP/2 connection over TLS', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createSecureServer(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (_request, response) => {
        response.end('original-response')
      }
    )
  })

  await using session = connectHttp2Session(server.https.url('/'), {
    ca: TLS_CERTIFICATE,
  })
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('original-response')
})
