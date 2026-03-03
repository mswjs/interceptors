// @vitest-environment node
import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', async (req, res) => {
    await setTimeout(300)
    res.status(200).send('original-response')
  })
})

const interceptor = new HttpRequestInterceptor()

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

    await setTimeout(250)

    controller.respondWith(new Response('mocked-response', { status: 201 }))
  })

  const requests = await Promise.all([
    toWebResponse(http.get(httpServer.http.url('/'))),
    toWebResponse(
      http.get(httpServer.http.url('/'), {
        headers: {
          'x-ignore-request': 'yes',
        },
      })
    ),
  ])

  expect(requests[0][0].status).toEqual(201)
  await expect(requests[0][0].text()).resolves.toBe('mocked-response')

  expect(requests[1][0].status).toEqual(200)
  await expect(requests[1][0].text()).resolves.toBe('original-response')
})
