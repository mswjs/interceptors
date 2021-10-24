import { IncomingMessage } from 'http'
import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver() {},
})

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/customer', (req, res) => {
      res.status(200).send('Invalid API credentials')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('allows attaching custom listeners to IncomingMessage', async () => {
  class NodeHttpResponse {
    private res: IncomingMessage

    constructor(res: IncomingMessage) {
      this.res = res
    }

    toText() {
      return new Promise((resolve, reject) => {
        let response = ''

        this.res.setEncoding('utf8')
        this.res.on('data', (chunk) => {
          response += chunk
        })

        this.res.once('end', () => {
          try {
            resolve(response)
          } catch (error) {
            reject(error)
          }
        })
      })
    }
  }

  class NodeHttpRequest {
    makeRequest(method: string, url: string): Promise<NodeHttpResponse> {
      return new Promise((resolve, reject) => {
        const req = https.request(url, {
          method,
          agent: httpsAgent,
        })

        req.on('response', (res) => {
          resolve(new NodeHttpResponse(res))
        })

        req.on('error', (error) => {
          reject(error)
        })

        req.once('socket', () => {
          req.end()
        })
      })
    }
  }

  const req = new NodeHttpRequest()
  const res = await req.makeRequest(
    'POST',
    httpServer.https.makeUrl('/customer')
  )
  const text = await res.toText()
  expect(text).toEqual('Invalid API credentials')
}, 2000)
