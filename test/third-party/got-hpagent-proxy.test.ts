import { beforeAll, afterAll, it } from 'vitest'
import got from 'got'
import { HttpProxyAgent } from 'hpagent'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('', async () => {
  interceptor.once('request', ({ request }) => {
    console.log(
      'REQUEST',
      request.method,
      /**
       * @todo "request.url" must already be the TARGET url
       * ("http://username:password@fake.proxy:443")
       */
      request.url
    )

    // First, the interceptor must handle the "CONNECT" request.
    // Here, it decides whether to allow connection to the proxy target.
    if (request.method === 'CONNECT') {
      return request.respondWith(
        new Response(null, {
          status: 200,
          statusText: 'Connection Established',
        })
      )
    }

    console.log('NOT HANDLED!')
  })

  const proxyHost = 'fake.proxy'
  const username = 'proxyUsername'
  const password = 'proxyPassword'
  const port = '443'
  const PING_URL = 'http://fake.ping/pinging'

  const proxyAgent = new HttpProxyAgent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 256,
    maxFreeSockets: 256,
    scheduling: 'lifo',
    proxy: `http://${username}:${password}@${proxyHost}:${port}`,
  })

  const response = await got.get({
    url: PING_URL,
    agent: {
      http: proxyAgent,
    },
  })

  console.log('response done!')
})
