/**
 * @jest-environment node
 */
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { prepare, httpsGet } from '../../helpers'
import { ServerAPI, createServer, httpsAgent } from '../../utils/createServer'

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerAPI

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/user', (req, res) => {
      res.status(200).send('user-body').end()
    })
  })

  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(async () => {
  requestInterceptor.restore()
  await server.close()
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepare(
    httpsGet(server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})
