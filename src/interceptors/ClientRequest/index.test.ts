import * as http from 'http'
import { ServerApi, createServer } from '@open-draft/test-server'
import { ClientRequestInterceptor } from '.'

let httpServer: ServerApi

const interceptor = new ClientRequestInterceptor()

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
  interceptor.dispose()
  await httpServer.close()
})

it('forbids calling "respondWith" multiple times for the same request', (done) => {
  const requestUrl = httpServer.http.makeUrl('/')

  interceptor.on('request', (request) => {
    request.respondWith({ status: 200 })
  })

  interceptor.on('request', (request) => {
    expect(() => request.respondWith({ status: 301 })).toThrow(
      `Failed to respond to "GET ${requestUrl}" request: the "request" event has already been responded to.`
    )

    done()
  })

  http.get(requestUrl)
})
