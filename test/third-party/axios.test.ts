/**
 * @jest-environment jsdom
 */
import axios from 'axios'
import { ServerApi, createServer } from '@open-draft/test-server'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  if (request.url.pathname === '/user') {
    request.respondWith({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-header': 'yes',
      },
      body: JSON.stringify({
        mocked: true,
      }),
    })
  }
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/books', (req, res) => {
      res.status(200).json([
        {
          title: 'The Lord of the Rings',
          author: 'J. R. R. Tolkien',
        },
        {
          title: 'The Hobbit',
          author: 'J. R. R. Tolkien',
        },
      ])
    })
  })
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('responds with a mocked response to an "axios()" request', async () => {
  const res = await axios('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

test('responds with a mocked response to an "axios.get()" request', async () => {
  const res = await axios.get('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

test('responds with a mocked response to an "axios.post()" request', async () => {
  const res = await axios.post('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

test('bypass the interceptor and return the original response', async () => {
  const res = await axios.get(httpServer.http.makeUrl('/books'))

  expect(res.status).toEqual(200)
  expect(res.data).toEqual([
    {
      title: 'The Lord of the Rings',
      author: 'J. R. R. Tolkien',
    },
    {
      title: 'The Hobbit',
      author: 'J. R. R. Tolkien',
    },
  ])
})
