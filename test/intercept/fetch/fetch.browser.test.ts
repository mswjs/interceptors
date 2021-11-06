/**
 * @jest-environment node
 */
import * as path from 'path'
import { RequestHandler } from 'express'
import { createServer, ServerApi } from '@open-draft/test-server'
import { Response, pageWith, ScenarioApi } from 'page-with'
import { extractRequestFromPage } from '../../helpers'
import { IsomorphicRequest } from '../../../src/createInterceptor'

let httpServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'fetch.browser.runtime.js'),
  })
}

async function callFetch(
  context: ScenarioApi,
  url: string,
  init: RequestInit = {}
): Promise<[IsomorphicRequest, Response]> {
  return Promise.all([
    extractRequestFromPage(context.page),
    context.request(url, init),
  ])
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
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
  await httpServer.close()
})

describe('HTTP', () => {
  test('intercepts an HTTP GET request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request.method).toEqual('GET')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP POST request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'post' }),
    })

    expect(request.method).toEqual('POST')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"post"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP PUT request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'put' }),
    })

    expect(request.method).toEqual('PUT')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"put"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP PATCH request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'patch' }),
    })

    expect(request.method).toEqual('PATCH')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"patch"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP DELETE request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'delete' }),
    })

    expect(request.method).toEqual('DELETE')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"delete"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })
})

describe('HTTPS', () => {
  test('intercepts an HTTPS GET request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.https.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request.method).toEqual('GET')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS POST request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.https.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'post' }),
    })

    expect(request.method).toEqual('POST')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"post"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS PUT request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.https.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'put' }),
    })

    expect(request.method).toEqual('PUT')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"put"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS PATCH request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.https.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'patch' }),
    })

    expect(request.method).toEqual('PATCH')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"patch"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS DELETE request', async () => {
    const context = await prepareRuntime()
    const url = httpServer.https.makeUrl('/user?id=123')
    const [request, response] = await callFetch(context, url, {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'delete' }),
    })

    expect(request.method).toEqual('DELETE')
    expect(request.url.href).toEqual(url)
    expect(request.headers.get('x-custom-header')).toEqual('yes')
    expect(request.credentials).toEqual('same-origin')
    expect(request.body).toEqual('{"body":"delete"}')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })
})

it('sets "credentials" to "include" on the isomorphic request when fetch sets it to "include"', async () => {
  const context = await prepareRuntime()
  const url = httpServer.https.makeUrl('/user')
  const [request] = await callFetch(context, url, {
    mode: 'no-cors',
    credentials: 'include',
  })

  expect(request.credentials).toEqual('include')
})

it('sets "credentials" to "omit" on the isomorphic request when fetch sets it to "omit"', async () => {
  const context = await prepareRuntime()
  const url = httpServer.http.makeUrl('/user')
  const [request] = await callFetch(context, url, {
    credentials: 'omit',
  })

  expect(request.credentials).toEqual('omit')
})
