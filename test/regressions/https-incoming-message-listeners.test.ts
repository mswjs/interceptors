import * as https from 'https'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { IncomingMessage } from 'node:http'

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver() {
    return {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        errorMessage: 'Invalid API credentials',
      }),
    }
  },
})

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/customer', (req, res) => {
      res.status(500).json('Failed to intercept request')
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
    toJSON() {
      return new Promise((resolve, reject) => {
        let response = ''
        this.res.setEncoding('utf8')
        this.res.on('data', (chunk) => {
          response += chunk
        })
        this.res.once('end', () => {
          try {
            resolve(JSON.parse(response))
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

        req.on('socket', () => {
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
  const json = await res.toJSON()
  expect(json).toEqual({
    errorMessage: 'Invalid API credentials',
  })
})
