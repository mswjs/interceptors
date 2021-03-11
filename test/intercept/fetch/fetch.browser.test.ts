/**
 * @jest-environment jsdom
 */
import * as path from 'path'
import { RequestHandler } from 'express'
import { createServer, ServerApi } from '@open-draft/test-server'
import { pageWith, ScenarioApi } from 'page-with'

interface ExpectedRequest {
  method: string
  url: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body: string
}

declare namespace window {
  // Pass the expected request object to the page's context.
  export let expected: ExpectedRequest
}

let server: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'fetch.intercept.runtime.js'),
  })
}

async function prepareFetch(
  context: ScenarioApi,
  url: string,
  init: RequestInit = {},
  assertions: { expected: ExpectedRequest }
) {
  await context.page.evaluate((expected) => {
    window.expected = expected
  }, assertions.expected)

  return context.request(url, init).catch((error) => {
    console.error(error)
    return null
  })
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
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        headers: {
          'x-custom-header': 'yes',
        },
      },
      {
        expected: {
          method: 'GET',
          url,
          query: {
            id: '123',
          },
          headers: {
            'x-custom-header': 'yes',
          },
          body: '',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP POST request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'post' }),
      },
      {
        expected: {
          method: 'POST',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"post"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PUT request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'put' }),
      },
      {
        expected: {
          method: 'PUT',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"put"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP PATCH request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'PATCH',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'patch' }),
      },
      {
        expected: {
          method: 'PATCH',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"patch"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTP DELETE request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'DELETE',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'delete' }),
      },
      {
        expected: {
          method: 'DELETE',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"delete"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })
})

describe('HTTPS', () => {
  test('intercepts an HTTPS GET request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        headers: {
          'x-custom-header': 'yes',
        },
      },
      {
        expected: {
          method: 'GET',
          url,
          query: {
            id: '123',
          },
          headers: {
            'x-custom-header': 'yes',
          },
          body: '',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS POST request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'POST',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'post' }),
      },
      {
        expected: {
          method: 'POST',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"post"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PUT request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'PUT',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'put' }),
      },
      {
        expected: {
          method: 'PUT',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"put"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS PATCH request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'PATCH',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'patch' }),
      },
      {
        expected: {
          method: 'PATCH',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"patch"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })

  test('intercepts an HTTPS DELETE request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    const response = await prepareFetch(
      context,
      url,
      {
        method: 'DELETE',
        headers: {
          'x-custom-header': 'yes',
        },
        body: JSON.stringify({ body: 'delete' }),
      },
      {
        expected: {
          method: 'DELETE',
          url,
          headers: {
            'x-custom-header': 'yes',
          },
          query: {
            id: '123',
          },
          body: '{"body":"delete"}',
        },
      }
    )

    expect(response?.status()).toBe(200)
    expect(response?.statusText()).toBe('OK')
    expect(response?.text()).resolves.toBe('user-body')
  })
})
