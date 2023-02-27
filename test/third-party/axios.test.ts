// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import axios from 'axios'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
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

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  const url = new URL(request.url)

  if (url.pathname === '/user') {
    request.respondWith(
      new Response(
        JSON.stringify({
          mocked: true,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-header': 'yes',
          },
        }
      )
    )
  }
})

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds with a mocked response to an "axios()" request', async () => {
  const res = await axios('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

it('responds with a mocked response to an "axios.get()" request', async () => {
  const res = await axios.get('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

it('responds with a mocked response to an "axios.post()" request', async () => {
  const res = await axios.post('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

it('bypass the interceptor and return the original response', async () => {
  const res = await axios.get(httpServer.http.url('/books'))

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
