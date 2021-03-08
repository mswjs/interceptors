/**
 * @jest-environment node
 */
import * as http from 'http'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { IsomoprhicRequest } from '../../../src/createInterceptor'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { httpGet, prepare } from '../../helpers'
import { getIncomingMessageBody } from '../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'

let pool: IsomoprhicRequest[] = []
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

test('intercepts an http.get request', async () => {
  const request = await prepare(
    httpGet(server.http.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an http.get requets given RequestOptions without a protocol', (done) => {
  // Create a request with `RequetOptions` but without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const request = http.get(
    {
      host: server.http.getAddress().host,
      port: server.http.getAddress().port,
      path: '/user',
    },
    async (response) => {
      const responseBody = await getIncomingMessageBody(response)
      expect(responseBody).toBe('user-body')

      done()
    }
  )

  request.end()
})
