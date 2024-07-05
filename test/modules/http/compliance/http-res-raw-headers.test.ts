/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

// The actual server is here for A/B purpose only.
const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.writeHead(200, { 'X-CustoM-HeadeR': 'Yes' })
    res.end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('preserves the original mocked response headers casing in "rawHeaders"', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: {
          'X-CustoM-HeadeR': 'Yes',
        },
      })
    )
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers).toMatchObject({ 'x-custom-header': 'Yes' })
})
