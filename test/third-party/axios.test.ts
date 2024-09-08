// @vitest-environment jsdom
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import axios from 'axios'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { useCors } from '../helpers'

function createMockResponse() {
  return new Response(
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
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
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

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('responds with a mocked response to an "axios()" request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(createMockResponse())
  })

  const response = await axios('/user')

  expect(response.status).toEqual(200)
  expect(response.headers).toHaveProperty('x-header', 'yes')
  expect(response.data).toEqual({ mocked: true })
})

it('responds with a mocked response to an "axios.get()" request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(createMockResponse())
  })

  const res = await axios.get('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

it('responds with a mocked response to an "axios.post()" request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(createMockResponse())
  })

  const res = await axios.post('/user')

  expect(res.status).toEqual(200)
  expect(res.headers).toHaveProperty('x-header', 'yes')
  expect(res.data).toEqual({ mocked: true })
})

it('bypass the interceptor and return the original response', async () => {
  interceptor.on('request', () => {
    // Intentionally do nothing.
  })

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

/**
 * @see https://github.com/mswjs/interceptors/issues/564
 */
it('preserves the "auth" options', async () => {
  const getRequestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request }) => {
    // Axios/XHR also dispatches an "OPTIONS" preflight request.
    // We only ever care about GET here.
    if (request.method === 'GET') {
      getRequestPromise.resolve(request)
    }
  })

  // Construct an Axios request with "auth".
  await axios.get(httpServer.http.url('/books'), {
    adapter: 'http',
    auth: {
      // Use an email address as the username.
      // This must NOT be encoded.
      username: 'foo@bar.com',
      password: 'secret123',
    },
  })

  const request = await getRequestPromise
  expect(request.headers.get('Authorization')).toBe(
    `Basic ${btoa('foo@bar.com:secret123')}`
  )
})

it('follows a mocked redirect response (xhr)', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('http://localhost:3000/redirected', 307)
      )
    }

    if (request.url.endsWith('/redirected')) {
      controller.respondWith(new Response('redirected response'))
    }
  })

  const response = await axios.get('http://localhost:3000/original', {
    adapter: 'xhr',
  })

  expect(response.status).toBe(200)
  expect(response.data).toBe('redirected response')
})

it('follows a mocked redirect response (http)', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('http://localhost/redirected', 307)
      )
    }

    if (request.url.endsWith('/redirected')) {
      controller.respondWith(new Response('redirected response'))
    }
  })

  const response = await axios.get('http://localhost/original', {
    adapter: 'http',
  })

  expect(response.status).toBe(200)
  expect(response.data).toBe('redirected response')
})
