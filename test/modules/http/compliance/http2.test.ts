// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/853
 */
import http2 from 'node:http2'
import { once } from 'node:events'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { createRawTestServer } from '#/test/helpers'
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

async function getResponseText(session: http2.ClientHttp2Session) {
  const stream = session.request({ ':path': '/' })
  let responseText = ''

  for await (const chunk of stream.setEncoding('utf8')) {
    responseText += chunk
  }

  // Close the session before the server gets disposed of.
  session.close()
  await once(session, 'close')

  return responseText
}

it('passes through an HTTP/2 connection', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const session = http2.connect(server.http.url('/'))

  await expect(getResponseText(session)).resolves.toBe('original-response')
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

  const session = http2.connect(server.https.url('/'), { ca: TLS_CERTIFICATE })

  await expect(getResponseText(session)).resolves.toBe('original-response')
})
