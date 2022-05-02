/**
 * @jest-environment node
 * @see https://github.com/mswjs/interceptors/issues/131
 */
import * as https from 'https'
import { URL } from 'url'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { getIncomingMessageBody } from '../../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

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

test('performs the original HTTPS request', (done) => {
  https
    .request(
      new URL(httpServer.https.url('/resource')),
      {
        method: 'GET',
        agent: httpsAgent,
      },
      async (res) => {
        const responseText = await getIncomingMessageBody(res)
        expect(responseText).toEqual('hello')
        done()
      }
    )
    .end()
})
