/**
 * @jest-environment node
 */
import { IncomingMessage } from 'http'
import * as https from 'https'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { getRequestOptionsByUrl } from '../../../../src/utils/getRequestOptionsByUrl'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/get', (req, res) => {
    res.status(200).send('/').end()
  })
})

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if ([httpServer.https.url('/get')].includes(request.url.href)) {
    return
  }

  request.respondWith({
    status: 403,
    statusText: 'Forbidden',
    body: 'mocked-body',
  })
})

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('calls a custom callback once when the request is bypassed', (done) => {
  let text: string = ''

  const responseCallback = jest.fn<void, [IncomingMessage]>((res) => {
    res.on('data', (chunk) => (text += chunk))
    res.on('end', () => {
      // Check that the request was bypassed.
      expect(text).toEqual('/')

      // Custom callback to "https.get" must be called once.
      expect(responseCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(httpServer.https.url('/get'))),
      agent: httpsAgent,
    },
    responseCallback
  )
})

test('calls a custom callback once when the response is mocked', (done) => {
  let text: string = ''

  const responseCallback = jest.fn<void, [IncomingMessage]>((res) => {
    res.on('data', (chunk) => (text += chunk))
    res.on('end', () => {
      // Check that the response was mocked.
      expect(text).toEqual('mocked-body')

      // Custom callback to `https.get` must be called once.
      expect(responseCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(httpServer.https.url('/arbitrary'))),
      agent: httpsAgent,
    },
    responseCallback
  )
})
