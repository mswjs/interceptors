/**
 * @jest-environment node
 */
import https from 'https'
import { IncomingMessage } from 'http'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { getRequestOptionsByUrl } from '../../src/utils/getRequestOptionsByUrl'

let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    if ([server.https.makeUrl('/get')].includes(request.url.href)) {
      return
    }

    return {
      status: 403,
      statusText: 'Forbidden',
      body: 'mocked-body',
    }
  },
})

beforeAll(async () => {
  server = await createServer((app) => {
    app.get('/get', (req, res) => {
      res.status(200).send('/').end()
    })
  })

  interceptor.apply()
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('calls a custom callback once when the request is bypassed', (done) => {
  let responseBody: string = ''

  const responseCallback = jest.fn<void, [IncomingMessage]>((response) => {
    response.on('data', (chunk) => (responseBody += chunk))
    response.on('end', () => {
      // Check that the request was bypassed.
      expect(responseBody).toEqual('/')

      // Custom callback to "https.get" must be called once.
      expect(responseCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(server.https.makeUrl('/get'))),
      agent: httpsAgent,
    },
    responseCallback
  )
})

test('calls a custom callback once when the response is mocked', (done) => {
  let responseBody: string = ''

  const responseCallback = jest.fn<void, [IncomingMessage]>((response) => {
    response.on('data', (chunk) => (responseBody += chunk))
    response.on('end', () => {
      // Check that the response was mocked.
      expect(responseBody).toEqual('mocked-body')

      // Custom callback to `https.get` must be called once.
      expect(responseCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get(
    {
      ...getRequestOptionsByUrl(new URL(server.https.makeUrl('/arbitrary'))),
      agent: httpsAgent,
    },
    responseCallback
  )
})
