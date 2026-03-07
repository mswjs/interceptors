/**
 * @vitest-environment node
 * @see https://github.com/mswjs/interceptors/issues/131
 */
import https from 'node:https'
import { URL } from 'node:url'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.status(200).send('hello')
  })
})
const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('performs the original HTTPS request', async () => {
  const request = https
    .request(new URL(httpServer.https.url('/resource')), {
      method: 'GET',
      rejectUnauthorized: false,
    })
    .end()

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toEqual('hello')
})
