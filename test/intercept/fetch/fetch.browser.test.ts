/**
 * @jest-environment jsdom
 */
import * as path from 'path'
import { RequestHandler } from 'express'
import { createServer, ServerApi } from '@open-draft/test-server'
import { pageWith, ScenarioApi } from 'page-with'
import { IsomoprhicRequest } from '../../../src'
import { findRequest } from '../../helpers'

declare namespace window {
  export const pool: Array<PoolEntry>
}

type SerializedIsomorphicRequest = Omit<IsomoprhicRequest, 'url'> & {
  url: string
}

interface SerializedRequestRef {
  isRequestInstance: boolean
  url: string
  method: string
}

interface PoolEntry {
  request: SerializedIsomorphicRequest
  ref: SerializedRequestRef
}

let server: ServerApi

function deserializeRequest(
  request: SerializedIsomorphicRequest
): IsomoprhicRequest {
  return {
    ...request,
    url: new URL(request.url),
  }
}

async function prepareFetch(
  scenario: ScenarioApi,
  url: string,
  init?: RequestInit
) {
  const response = await scenario.request(url, init)
  const { pool, refs } = await scenario.page
    .evaluate(() => window.pool)
    .then((pool) =>
      pool.reduce<{ pool: IsomoprhicRequest[]; refs: SerializedRequestRef[] }>(
        (acc, entry) => {
          acc.refs.push(entry.ref)
          acc.pool.push(deserializeRequest(entry.request))
          return acc
        },
        { pool: [], refs: [] }
      )
    )

  const method = init?.method || 'GET'
  const request = findRequest(pool, method, url)!
  const ref = refs.find((ref) => {
    return ref.method === method && ref.url === url
  })

  return { request, response, pool, ref }
}

beforeAll(async () => {
  server = await createServer((app) => {
    const handleRequest: RequestHandler = (req, res) => {
      res.status(200).send('user-body').end()
    }

    app.get('/user', handleRequest)
    app.post('/user', handleRequest)
    app.put('/user', handleRequest)
    app.delete('/user', handleRequest)
    app.patch('/user', handleRequest)
    app.head('/user', handleRequest)
  })
})

afterAll(async () => {
  await server.close()
})

describe('HTTP', () => {
  test('intercepts an HTTP GET request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const url = server.http.makeUrl('/user?id=123')
    const { request, response, ref } = await prepareFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'GET')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'GET')
    expect(ref).toHaveProperty('url', server.http.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP POST request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.http.makeUrl('/user?id=123'),
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'POST')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'POST')
    expect(ref).toHaveProperty('url', server.http.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PUT request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.http.makeUrl('/user?id=123'),
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PUT')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'PUT')
    expect(ref).toHaveProperty('url', server.http.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PATCH request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.http.makeUrl('/user?id=123'),
      {
        method: 'PATCH',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PATCH')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'PATCH')
    expect(ref).toHaveProperty('url', server.http.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP DELETE request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.http.makeUrl('/user?id=123'),
      {
        method: 'DELETE',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'DELETE')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'DELETE')
    expect(ref).toHaveProperty('url', server.http.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })
})

describe('HTTPS', () => {
  test('intercepts an HTTPS GET request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const url = server.https.makeUrl('/user?id=123')
    const { request, response, ref } = await prepareFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'GET')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'GET')
    expect(ref).toHaveProperty('url', server.https.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS POST request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.https.makeUrl('/user?id=123'),
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'POST')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'POST')
    expect(ref).toHaveProperty('url', server.https.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PUT request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.https.makeUrl('/user?id=123'),
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PUT')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'PUT')
    expect(ref).toHaveProperty('url', server.https.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PATCH request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.https.makeUrl('/user?id=123'),
      {
        method: 'PATCH',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PATCH')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'PATCH')
    expect(ref).toHaveProperty('url', server.https.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS DELETE request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response, ref } = await prepareFetch(
      context,
      server.https.makeUrl('/user?id=123'),
      {
        method: 'DELETE',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: true }),
      }
    )

    // Creates correct isomorphic request.
    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'DELETE')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    // Provides correct request reference.
    expect(ref).toHaveProperty('isRequestInstance', true)
    expect(ref).toHaveProperty('method', 'DELETE')
    expect(ref).toHaveProperty('url', server.https.makeUrl('/user?id=123'))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })
})
