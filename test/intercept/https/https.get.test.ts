/**
 * @jest-environment node
 */
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { IsomorphicRequest } from '../../../src/createInterceptor'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { prepare, httpsGet } from '../../helpers'
import { getIncomingMessageBody } from '../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'

let pool: IsomorphicRequest[] = []
let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    pool.push(request)
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/user', (req, res) => {
      res.status(200).send('user-body').end()
    })
  })

  interceptor.apply()
})

afterEach(() => {
  pool = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepare(
    httpsGet(server.https.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an https.get request given RequestOptions without a protocol', async (done) => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  const request = https.get(
    {
      host: server.https.getAddress().host,
      port: server.https.getAddress().port,
      path: '/user',
      // Suppress the "certificate has expired" error.
      rejectUnauthorized: false,
    },
    async (response) => {
      const responseBody = await getIncomingMessageBody(response)
      expect(responseBody).toBe('user-body')

      done()
    }
  )

  request.end()
})
