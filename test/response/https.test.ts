/**
 * @jest-environment node
 */
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { httpsGet, httpsRequest } from '../helpers'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    if (request.url.pathname === '/non-existing') {
      return {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }

    if (request.url.href === 'https://error.me/') {
      throw new Error('Custom exception message')
    }
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).send('/').end()
    })
    app.get('/get', (req, res) => {
      res.status(200).send('/get').end()
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('responds to an HTTPS request issued by "https.request" and handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest('https://any.thing/non-existing')

  expect(res.statusCode).toEqual(400)
  expect(res.statusMessage).toEqual('Bad Request')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.request" not handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest(server.https.makeUrl('/get'), {
    agent: httpsAgent,
  })

  expect(res.statusCode).toEqual(200)
  expect(resBody).toEqual('/get')
})

test('responds to an HTTPS request issued by "https.get" and handled in the middleware', async () => {
  const { res, resBody } = await httpsGet('https://any.thing/non-existing')

  expect(res.statusCode).toEqual(400)
  expect(res.statusMessage).toEqual('Bad Request')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.get" not handled in the middleware', async () => {
  const { res, resBody } = await httpsGet(server.https.makeUrl('/get'), {
    agent: httpsAgent,
  })

  expect(res.statusCode).toEqual(200)
  expect(resBody).toEqual('/get')
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => httpsGet('https://error.me')
  await expect(getResponse()).rejects.toThrow('Custom exception message')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const { res, resBody } = await httpsGet(server.https.makeUrl('/'), {
    agent: httpsAgent,
  })

  expect(res.statusCode).toBe(200)
  expect(resBody).toEqual('/')
})
