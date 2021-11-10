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
  async resolver(request) {
    if (request.headers.get('x-bypass')) {
      return
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 201,
          body: 'mocked-response',
        })
      }, 250)
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
    httpGet(httpServer.http.makeUrl('/')),
    httpGet(httpServer.http.makeUrl('/'), {
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
