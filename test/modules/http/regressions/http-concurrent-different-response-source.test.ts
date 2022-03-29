/**
 * @jest-environment node
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { httpGet } from '../../../helpers'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  async resolver(event) {
    const { request } = event

    if (request.headers.get('x-bypass')) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 250))

    event.respondWith({
      status: 201,
      body: 'mocked-response',
    })
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (req, res) => {
      setTimeout(() => {
        res.status(200).send('original-response')
      }, 300)
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('handles concurrent requests with different response sources', async () => {
  const requests = await Promise.all([
    httpGet(httpServer.http.url('/')),
    httpGet(httpServer.http.url('/'), {
      headers: {
        'x-bypass': 'yes',
      },
    }),
  ])

  expect(requests[0].res.statusCode).toEqual(201)
  expect(requests[0].resBody).toEqual('mocked-response')

  expect(requests[1].res.statusCode).toEqual(200)
  expect(requests[1].resBody).toEqual('original-response')
})
