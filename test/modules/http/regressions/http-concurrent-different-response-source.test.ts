/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { httpGet } from '../../../helpers'
import { sleep } from '../../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', async (req, res) => {
    await sleep(300)
    res.status(200).send('original-response')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles concurrent requests with different response sources', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    if (request.headers.get('x-ignore-request')) {
      return
    }

    await sleep(250)

    controller.respondWith(new Response('mocked-response', { status: 201 }))
  })

  const requests = await Promise.all([
    httpGet(httpServer.http.url('/')),
    httpGet(httpServer.http.url('/'), {
      headers: {
        'x-ignore-request': 'yes',
      },
    }),
  ])

  expect(requests[0].res.statusCode).toEqual(201)
  expect(requests[0].resBody).toEqual('mocked-response')

  expect(requests[1].res.statusCode).toEqual(200)
  expect(requests[1].resBody).toEqual('original-response')
})
