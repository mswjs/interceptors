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
  export const pool: Array<SerializedIsomorphicRequest>
}

type SerializedIsomorphicRequest = Omit<IsomoprhicRequest, 'url'> & {
  url: string
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
  const pool = await scenario.page
    .evaluate(() => window.pool)
    .then((pool) => pool.map(deserializeRequest))
  const request = findRequest(pool, init?.method || 'GET', url)!

  return { request, response, pool }
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
    const { request, response } = await prepareFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'GET')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP POST request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'POST')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PUT request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PUT')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PATCH request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PATCH')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP DELETE request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.http.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'DELETE')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

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
    const { request, response } = await prepareFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'GET')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS POST request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'POST')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PUT request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PUT')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PATCH request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'PATCH')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS DELETE request', async () => {
    const context = await pageWith({
      example: path.resolve(__dirname, 'fetch.runtime.js'),
    })

    const { request, response } = await prepareFetch(
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

    expect(request).toBeTruthy()
    expect(request.url).toBeInstanceOf(URL)
    expect(request.url.toString()).toBe(server.https.makeUrl('/user?id=123'))
    expect(request.url.searchParams.get('id')).toBe('123')
    expect(request).toHaveProperty('method', 'DELETE')
    expect(request.headers).toHaveProperty('x-custom-header', 'yes')
    expect(request).toHaveProperty('body', JSON.stringify({ body: true }))

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(response.text()).resolves.toBe('user-body')
  })
})
