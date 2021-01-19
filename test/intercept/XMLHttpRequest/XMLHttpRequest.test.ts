import { RequestHandler } from 'express'
import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestInterceptor } from '../../../src'
import withDefaultInterceptors from '../../../src/presets/default'
import { InterceptedRequest } from '../../../src/glossary'
import { findRequest, createXMLHttpRequest } from '../../helpers'

function lookupRequest(
  req: XMLHttpRequest,
  method: string,
  pool: InterceptedRequest[]
): InterceptedRequest | undefined {
  return findRequest(pool, method, req.responseURL)
}

let requestInterceptor: RequestInterceptor
let pool: InterceptedRequest[] = []
let server: ServerApi

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
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'GET', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'GET')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTP POST request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('request-body')
  })
  const interceptedReq = lookupRequest(req, 'POST', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'POST')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('body', 'request-body')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTP PUT request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'PUT', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'PUT')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTP DELETE request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('DELETE', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'DELETE', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'DELETE')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTP PATCH request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PATCH', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'PATCH', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'PATCH')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTP HEAD request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('HEAD', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'HEAD', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'HEAD')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS GET request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'GET', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'GET')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS POST request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('request-body')
  })
  const interceptedReq = lookupRequest(req, 'POST', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'POST')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('body', 'request-body')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS PUT request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'PUT', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'PUT')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS DELETE request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('DELETE', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'DELETE', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'DELETE')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS PATCH request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PATCH', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'PATCH', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'PATCH')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})

test('intercepts an HTTPS HEAD request', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('HEAD', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const interceptedReq = lookupRequest(req, 'HEAD', pool)

  expect(interceptedReq).toBeTruthy()
  expect(interceptedReq?.url).toBeInstanceOf(URL)
  expect(interceptedReq?.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(interceptedReq).toHaveProperty('method', 'HEAD')
  expect(interceptedReq?.url.searchParams.get('id')).toEqual('123')
  expect(interceptedReq).toHaveProperty('headers', {
    'x-custom-header': 'yes',
  })
})
