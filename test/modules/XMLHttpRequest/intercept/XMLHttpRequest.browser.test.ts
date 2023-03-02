import { HttpServer } from '@open-draft/test-server/http'
import { RequestHandler } from 'express-serve-static-core'
import { test, expect } from '../../../playwright.extend'

const httpServer = new HttpServer((app) => {
  const strictCorsMiddleware: RequestHandler = (req, res, next) => {
    res
      .set('Access-Control-Allow-Origin', req.headers.origin)
      .set('Access-Control-Allow-Methods', 'GET, POST')
      .set('Access-Control-Allow-Headers', [
        'content-type',
        'x-request-id',
        'x-request-header',
      ])
      .set('Access-Control-Allow-Credentials', 'true')
    return next()
  }

  const requestHandler: RequestHandler = (req, res) => {
    res.status(200).send('user-body')
  }

  app.options('/user', strictCorsMiddleware, (req, res) =>
    res.status(200).end()
  )
  app.get('/user', strictCorsMiddleware, requestHandler)
  app.post('/user', strictCorsMiddleware, requestHandler)
})

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test('intercepts an HTTP GET request', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./XMLHttpRequest.browser.runtime.js'))

  const url = httpServer.http.url('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'GET',
    url,
    headers: {
      'x-request-header': 'yes',
    },
  })

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(request.headers.get('x-request-header')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.body).toBe('user-body')
})

test('intercepts an HTTP POST request', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./XMLHttpRequest.browser.runtime.js'))

  const url = httpServer.http.url('/user')
  const [request, response] = await callXMLHttpRequest({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      'x-request-header': 'yes',
    },
    body: JSON.stringify({ user: 'john' }),
  })

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ user: 'john' })

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.body).toBe('user-body')
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./XMLHttpRequest.browser.runtime.js'))

  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: true,
  })

  expect(request.credentials).toBe('include')
})

test('sets "credentials" to "same-origin" on isomorphic request when "withCredentials" is false', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./XMLHttpRequest.browser.runtime.js'))

  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
    withCredentials: false,
  })

  expect(request.credentials).toBe('same-origin')
})

test('sets "credentials" to "same-origin" on isomorphic request when "withCredentials" is not set', async ({
  loadExample,
  callXMLHttpRequest,
}) => {
  await loadExample(require.resolve('./XMLHttpRequest.browser.runtime.js'))

  const url = httpServer.http.url('/user')
  const [request] = await callXMLHttpRequest({
    method: 'POST',
    url,
  })

  expect(request.credentials).toBe('same-origin')
})
