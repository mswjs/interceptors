/**
 * @jest-environment node
 * @see https://github.com/mswjs/interceptors/issues/131
 */
import * as https from 'https'
import { URL } from 'url'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { getIncomingMessageBody } from '../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'

let server: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver() {
    // Intentionally bypass all requests.
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/resource', (req, res) => {
      res.status(200).send('hello')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

it('performs the original https request', (done) => {
  https
    .request(
      new URL(server.https.makeUrl('/resource')),
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
