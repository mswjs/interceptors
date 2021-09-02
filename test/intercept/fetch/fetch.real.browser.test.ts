/**
 * @jest-environment node
 */
import * as path from 'path'
import { RequestHandler } from 'express'
import { createServer, ServerApi } from '@open-draft/test-server'
import { pageWith, ScenarioApi } from 'page-with'

interface ExpectedResponse {
  status: number
  statusText: string
  text: string
}
type RequestFunction = (
  url: string,
  init: RequestInit,
  expected: ExpectedResponse
) => Promise<void>

declare namespace window {
  // Pass the expected request object to the page's context.
  export const fetchData: RequestFunction
}

let server: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'fetch.real.runtime.js'),
  })
}

async function prepareFetch(
  context: ScenarioApi,
  url: string,
  init: RequestInit = {},
  expected: ExpectedResponse
) {
  await context.page.evaluate(
    ({ url, init, expected }) => {
      return window.fetchData(url, init, expected)
    },
    { url, init, expected }
  )
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
  test('skip an HTTP GET request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    await prepareFetch(
      context,
      url,
      {
        method: 'GET',
      },
      {
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTP POST request', async () => {
    const context = await prepareRuntime()
    const url = server.http.makeUrl('/user?id=123')
    await prepareFetch(
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTP PUT request', async () => {
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTP PATCH request', async () => {
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTP DELETE request', async () => {
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })
})

describe('HTTPS', () => {
  test('skip an HTTPS GET request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    await prepareFetch(
      context,
      url,
      {
        headers: {
          'x-custom-header': 'yes',
        },
      },
      {
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTPS POST request', async () => {
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTPS PUT request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    await prepareFetch(
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTPS PATCH request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    await prepareFetch(
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })

  test('skip an HTTPS DELETE request', async () => {
    const context = await prepareRuntime()
    const url = server.https.makeUrl('/user?id=123')
    await prepareFetch(
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
        status: 200,
        statusText: 'OK',
        text: 'user-body',
      }
    )
  })
})
