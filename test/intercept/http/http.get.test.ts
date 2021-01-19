/**
 * @jest-environment node
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { httpGet, prepare } from '../../helpers'

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerApi

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
