/**
 * @jest-environment node
 */
import * as http from 'http'
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { getIncomingMessageBody } from '../../../../src/interceptors/ClientRequest/utils/getIncomingMessageBody'

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
    app.get('/', (_req, res) => {
      res.status(200).send('/')
    })
    app.get('/get', (_req, res) => {
      res.status(200).send('/get')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('responds to a handled request issued by "http.get"', (done) => {
  http.get('http://any.thing/non-existing', async (res) => {
    expect(res.statusCode).toEqual(301)
    expect(res.statusMessage).toEqual('Moved Permanently')
    expect(res.headers).toHaveProperty('content-type', 'text/plain')
    expect(await getIncomingMessageBody(res)).toEqual('mocked')

    done()
  })
})

test('responds to a handled request issued by "https.get"', (done) => {
  https.get(
    'https://any.thing/non-existing',
    { agent: httpsAgent },
    async (res) => {
      expect(res.statusCode).toEqual(301)
      expect(res.statusMessage).toEqual('Moved Permanently')
      expect(res.headers).toHaveProperty('content-type', 'text/plain')
      expect(await getIncomingMessageBody(res)).toEqual('mocked')

      done()
    }
  )
})

test('bypasses an unhandled request issued by "http.get"', (done) => {
  http.get(httpServer.http.makeUrl('/get'), async (res) => {
    expect(res.statusCode).toEqual(200)
    expect(res.statusMessage).toEqual('OK')
    expect(await getIncomingMessageBody(res)).toEqual('/get')

    done()
  })
})

test('bypasses an unhandled request issued by "https.get"', (done) => {
  https.get(
    httpServer.https.makeUrl('/get'),
    { agent: httpsAgent },
    async (res) => {
      expect(res.statusCode).toEqual(200)
      expect(res.statusMessage).toEqual('OK')
      expect(await getIncomingMessageBody(res)).toEqual('/get')

      done()
    }
  )
})

test('responds to a handled request issued by "http.request"', (done) => {
  http
    .request('http://any.thing/non-existing', async (res) => {
      expect(res.statusCode).toBe(301)
      expect(res.statusMessage).toEqual('Moved Permanently')
      expect(res.headers).toHaveProperty('content-type', 'text/plain')
      expect(await getIncomingMessageBody(res)).toEqual('mocked')

      done()
    })
    .end()
})

test('responds to a handled request issued by "https.request"', (done) => {
  https
    .request(
      'https://any.thing/non-existing',
      { agent: httpsAgent },
      async (res) => {
        expect(res.statusCode).toEqual(301)
        expect(res.statusMessage).toEqual('Moved Permanently')
        expect(res.headers).toHaveProperty('content-type', 'text/plain')
        expect(await getIncomingMessageBody(res)).toEqual('mocked')

        done()
      }
    )
    .end()
})

test('bypasses an unhandled request issued by "http.request"', (done) => {
  http
    .request(httpServer.http.makeUrl('/get'), async (res) => {
      expect(res.statusCode).toEqual(200)
      expect(res.statusMessage).toEqual('OK')
      expect(await getIncomingMessageBody(res)).toEqual('/get')

      done()
    })
    .end()
})

test('bypasses an unhandled request issued by "https.request"', (done) => {
  https
    .request(
      httpServer.https.makeUrl('/get'),
      { agent: httpsAgent },
      async (res) => {
        expect(res.statusCode).toEqual(200)
        expect(res.statusMessage).toEqual('OK')
        expect(await getIncomingMessageBody(res)).toEqual('/get')

        done()
      }
    )
    .end()
})

test('throws a request error when the middleware throws an exception', (done) => {
  http.get('http://error.me').on('error', (error) => {
    expect(error.message).toEqual('Custom exception message')
    done()
  })
})

test('bypasses any request after the interceptor was restored', (done) => {
  interceptor.restore()

  http.get(httpServer.http.makeUrl('/'), async (res) => {
    expect(res.statusCode).toEqual(200)
    expect(res.statusMessage).toEqual('OK')
    expect(await getIncomingMessageBody(res)).toEqual('/')

    done()
  })
})
