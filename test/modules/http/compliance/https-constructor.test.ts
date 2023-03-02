/**
 * @see https://github.com/mswjs/interceptors/issues/131
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { IncomingMessage } from 'http'
import https from 'https'
import { URL } from 'url'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { getIncomingMessageBody } from '../../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.status(200).send('hello')
  })
})
const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('performs the original HTTPS request', async () => {
  const responseReceived = new DeferredPromise<IncomingMessage>()
  https
    .request(
      new URL(httpServer.https.url('/resource')),
      {
        method: 'GET',
        agent: httpsAgent,
      },
      async (response) => {
        responseReceived.resolve(response)
      }
    )
    .end()

  const response = await responseReceived
  expect(response.statusCode).toBe(200)

  const responseText = await getIncomingMessageBody(response)
  expect(responseText).toEqual('hello')
})
