import { RequestHandler } from 'express'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { xhr, findRequest } from '../../helpers'
import { ServerAPI, createServer } from '../../utils/createServer'

function prepareXHR(
  res: ReturnType<typeof xhr>,
  pool: InterceptedRequest[]
): Promise<InterceptedRequest | undefined> {
  return res.then(({ url, method }) => {
    return findRequest(pool, method, url)
  })
}

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerAPI

beforeAll(async () => {
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

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
  const request = await prepareXHR(
    xhr('GET', server.makeHttpUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP POST request', async () => {
  const request = await prepareXHR(
    xhr('POST', server.makeHttpUrl('/user?id=123'), {
      body: 'request-body',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PUT request', async () => {
  const request = await prepareXHR(
    xhr('PUT', server.makeHttpUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP DELETE request', async () => {
  const request = await prepareXHR(
    xhr('DELETE', server.makeHttpUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP PATCH request', async () => {
  const request = await prepareXHR(
    xhr('PATCH', server.makeHttpUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTP HEAD request', async () => {
  const request = await prepareXHR(
    xhr('HEAD', server.makeHttpUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS GET request', async () => {
  const request = await prepareXHR(
    xhr('GET', server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'GET')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS POST request', async () => {
  const request = await prepareXHR(
    xhr('POST', server.makeHttpsUrl('/user?id=123'), {
      body: 'request-body',
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'POST')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request).toHaveProperty('body', 'request-body')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PUT request', async () => {
  const request = await prepareXHR(
    xhr('PUT', server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PUT')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS DELETE request', async () => {
  const request = await prepareXHR(
    xhr('DELETE', server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'DELETE')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS PATCH request', async () => {
  const request = await prepareXHR(
    xhr('PATCH', server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'PATCH')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})

test('intercepts an HTTPS HEAD request', async () => {
  const request = await prepareXHR(
    xhr('HEAD', server.makeHttpsUrl('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    }),
    pool
  )

  expect(request).toBeTruthy()
  expect(request?.url).toBeInstanceOf(URL)
  expect(request?.url.toString()).toEqual(server.makeHttpsUrl('/user?id=123'))
  expect(request).toHaveProperty('method', 'HEAD')
  expect(request?.url.searchParams.get('id')).toEqual('123')
  expect(request?.headers).toHaveProperty('x-custom-header', 'yes')
})
