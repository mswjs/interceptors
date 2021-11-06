import fetch from 'node-fetch'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor, MockedResponse } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { httpGet, httpRequest } from '../helpers'

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  async resolver(req) {
    const { url, headers } = req
    if (headers.has('x-bypass')) {
      return
    }

    const response = await httpGet(httpServer.http.makeUrl(url.pathname), {
      headers: { 'x-bypass': 'yes' },
    })

    const mockedResponse: MockedResponse = {
      status: 201,
    }

    if (url.pathname === '/text') {
      mockedResponse.body = `hello, ${response.resBody}`
    }

    if (url.pathname === '/json') {
      mockedResponse.headers = {
        'Content-Type': 'application/json',
      }
      mockedResponse.body = JSON.stringify({
        text: 'hello',
        ...JSON.parse(response.resBody),
      })
    }

    return mockedResponse
  },
})

beforeAll(async () => {
  interceptor.apply()

  httpServer = await createServer((app) => {
    app.get('/text', (req, res) => {
      res.send('john')
    })
    app.get('/json', (req, res) => {
      res.json({ username: 'john' })
    })
  })
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

function createClient() {
  return (url: string) => {
    return fetch(httpServer.http.makeUrl(url), {
      headers: {
        accept: '*/*',
      },
    })
  }
}

test('supports response patching for texual response body', async () => {
  const client = createClient()
  const res = await client(httpServer.http.makeUrl('/text'))

  expect(res.status).toEqual(201)
  expect(await res.text()).toEqual('hello, john')
})

test('supports response patching for JSON response body', async () => {
  const client = createClient()
  const res = await client(httpServer.http.makeUrl('/json'))
  const json = await res.json()

  expect(res.status).toEqual(201)
  expect(json).toEqual({ text: 'hello', username: 'john' })
})
