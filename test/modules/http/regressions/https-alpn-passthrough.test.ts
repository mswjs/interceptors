// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/819
 */
import http2 from 'node:http2'
import { Agent, fetch } from 'undici'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { createRawTestServer } from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

const interceptor = new ClientRequestInterceptor()
const dispatcher = new Agent({
  allowH2: true,
  connect: { ca: TLS_CERTIFICATE },
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(async () => {
  await dispatcher.destroy()
  interceptor.dispose()
})

it('passes fetch requests through to a server offering HTTP/2', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createSecureServer(
      {
        cert: TLS_CERTIFICATE,
        key: TLS_PRIVATE_KEY,
        allowHTTP1: true,
      },
      (_request, response) => {
        response.end('original-response')
      }
    )
  })

  const response = await fetch(server.https.url('/'), { dispatcher })

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original-response')
})
