import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../helpers'

let server: ServerApi
let rawRequestHeaders: string[]

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {},
})

beforeAll(async () => {
  interceptor.apply()

  // Handle the request in an actual server
  // to inspect the raw request headers.
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      rawRequestHeaders = req.rawHeaders
      res.status(200).end()
    })
  })
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('request headers casing', async () => {
  await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/'))
    req.setRequestHeader('X-Custom-Token', 'abc-123')
  })

  expect(rawRequestHeaders).toContain('X-Custom-Token')
})
