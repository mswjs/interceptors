/**
 * @jest-environment node
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { httpGet, httpRequest } from '../helpers'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    if (request.url.pathname === '/non-existing') {
      return {
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'mocked',
      }
    }

    if (request.url.href === 'http://error.me/') {
      throw new Error('Custom exception message')
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).send('/')
    })
    app.get('/get', (req, res) => {
      res.status(200).send('/get')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('responds to an HTTP request issued by "http.request" and handled in the middleware', async () => {
  const { res, resBody } = await httpRequest('http://any.thing/non-existing')

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'text/plain')
  expect(resBody).toEqual('mocked')
})

test('bypasses an HTTP request issued by "http.request" not handled in the middleware', async () => {
  const { res, resBody } = await httpRequest(httpServer.http.makeUrl('/get'))

  expect(res.statusCode).toBe(200)
  expect(resBody).toEqual('/get')
})

test('responds to an HTTP request issued by "http.get" and handled in the middleeware', async () => {
  const { res, resBody } = await httpGet('http://any.thing/non-existing')

  expect(res.statusCode).toBe(301)
  expect(res.statusMessage).toEqual('Moved Permanently')
  expect(res.headers).toHaveProperty('content-type', 'text/plain')
  expect(resBody).toEqual('mocked')
})

test('bypasses an HTTP request issued by "http.get" not handled in the middleware', async () => {
  const { res, resBody } = await httpGet(httpServer.http.makeUrl('/get'))

  expect(res.statusCode).toBe(200)
  expect(resBody).toEqual('/get')
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => httpGet('http://error.me')
  await expect(getResponse()).rejects.toThrow('Custom exception message')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const { res, resBody } = await httpGet(httpServer.http.makeUrl('/'))

  expect(res.statusCode).toBe(200)
  expect(resBody).toEqual('/')
})
