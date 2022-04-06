/**
 * @jest-environment node
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { httpGet } from '../../../helpers'
import { sleep } from '../../../../test/helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', async (request) => {
  if (request.headers.get('x-bypass')) {
    return
  }

  await sleep(250)

  request.respondWith({
    status: 201,
    body: 'mocked-response',
  })
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', async (req, res) => {
      await sleep(300)
      res.status(200).send('original-response')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
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
