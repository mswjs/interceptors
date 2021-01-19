/**
 * @jest-environment node
 */
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { fetch, findRequest } from '../../helpers'

async function prepareFetch(
  executedFetch: ReturnType<typeof fetch>,
  pool: InterceptedRequest[]
) {
  return executedFetch.then(({ url, init }) => {
    return findRequest(pool, init?.method || 'GET', url)
  })
}

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerApi

beforeAll(async () => {
  server = await createServer((app) => {
    const handleUserRequest: RequestHandler = (req, res) => {
      res.status(200).send('user-body').end()
    }

    app.get('/user', handleUserRequest)
    app.post('/user', handleUserRequest)
    app.put('/user', handleUserRequest)
    app.delete('/user', handleUserRequest)
    app.patch('/user', handleUserRequest)
    app.head('/user', handleUserRequest)
  })

  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    pool.push(req)
  })
})

afterEach(() => {
  pool = []
})

afterAll(async () => {
  requestInterceptor.restore()
  await server.close()
})

test('intercepts an HTTP GET request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
})

test('intercepts an HTTP POST request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: true }),
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
})

test('intercepts an HTTP PUT request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTP DELETE request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTP PATCH request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTP HEAD request', async () => {
  const request = await prepareFetch(
    fetch(server.http.makeUrl('/user?id=123'), {
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.http.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTPS POST request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: true }),
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', JSON.stringify({ body: true }))
})

test('intercepts an HTTPS PUT request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTPS PATCH request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})

test('intercepts an HTTPS HEAD request', async () => {
  const request = await prepareFetch(
    fetch(server.https.makeUrl('/user?id=123'), {
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
      agent: httpsAgent,
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.https.makeUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.headers).toHaveProperty('accept', ['*/*'])
  expect(request?.headers).toHaveProperty('x-custom-header', ['yes'])
  expect(request?.url.searchParams.get('id')).toEqual('123')
})
