/**
 * @jest-environment node
 */
import { request } from 'https';
import { RequestInterceptor } from '../../src'
import { httpsGet, httpsRequest } from '../helpers'
import withDefaultInterceptors from '../../src/presets/default'
import { ServerAPI, createServer, httpsAgent } from '../utils/createServer'

let interceptor: RequestInterceptor
let server: ServerAPI

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).send('/').end()
    })
    app.get('/get', (req, res) => {
      res.status(200).send('/get').end()
    })
  })

  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    if ([server.getHttpsAddress()].includes(req.url.href)) {
      return {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mocked: true }),
      }
    }

    if (req.url.href === 'https://error.me/') {
      throw new Error('Custom exception message')
    }
  })
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('responds to an HTTPS request issued by "https.request" and handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest(server.makeHttpsUrl('/'))

  expect(res.statusCode).toEqual(400)
  expect(res.statusMessage).toEqual('Bad Request')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.request" not handled in the middleware', async () => {
  const { res, resBody } = await httpsRequest(server.makeHttpsUrl('/get'), {
    agent: httpsAgent,
  })

  expect(res.statusCode).toEqual(200)
  expect(resBody).toEqual('/get')
})

test('Correctly handles an HTTPS request issued by "https.request" from options without protocol', async () => {
  try {
    await new Promise((resolve, reject) => {
      const rejectError = (error: Error) => {
        reject(error)
      }
  
      const req = request({
        host: server.getHttpsServerHostName(),
        port: server.getHttpsServerPort(),
        path: '/get'
      }, (res) => {
        res.on('error', rejectError)
  
        res.on('end', () => {
          resolve()
        })
      })
  
      req.on('error', rejectError)
  
      req.end()
    })
  } catch (error) {
    expect(error.message).toMatch(/certificate/i)
  }

  //If we get here then node was happy with the protocol
})

test('responds to an HTTPS request issued by "https.get" and handled in the middleware', async () => {
  const { res, resBody } = await httpsGet(server.makeHttpsUrl('/'))

  expect(res.statusCode).toEqual(400)
  expect(res.statusMessage).toEqual('Bad Request')
  expect(res.headers).toHaveProperty('content-type', 'application/json')
  expect(resBody).toEqual(JSON.stringify({ mocked: true }))
})

test('bypasses an HTTPS request issued by "https.get" not handled in the middleware', async () => {
  const { res, resBody } = await httpsGet(server.makeHttpsUrl('/get'), {
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
  const { res, resBody } = await httpsGet(server.makeHttpsUrl('/'), {
    agent: httpsAgent,
  })

  expect(res.statusCode).toBe(200)
  expect(resBody).toEqual('/')
})
