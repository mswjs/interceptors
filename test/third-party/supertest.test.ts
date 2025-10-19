// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { HttpRequestEventMap } from '../../src'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const requestListener =
  vi.fn<(...args: HttpRequestEventMap['request']) => void>()
const responseListener =
  vi.fn<(...args: HttpRequestEventMap['response']) => void>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', requestListener)
interceptor.on('response', responseListener)

const app = express()

app.use(express.json())
app.get('/resource', (_, res) => {
  res.status(200).set('Content-Type', 'text/plain').send('get-request-body')
})
app.post('/resource', (req, res) => {
  res.status(200).json(req.body)
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a GET request', async () => {
  const response = await supertest(app).get('/resource')

  expect(response.error).toBeFalsy()
  expect(response.status).toBe(200)
  expect(response.text).toBe('get-request-body')

  // Must call the "request" listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const [{ request }] = requestListener.mock.calls[0]
  expect(request.method).toBe('GET')
  expect(request.body).toBeNull()

  // Must call the "response" listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [{ response: responseFromListener }] = responseListener.mock.calls[0]
  expect(responseFromListener.status).toBe(200)
  expect(responseFromListener.statusText).toBe('OK')
  expect(responseFromListener.headers.get('content-type')).toBe(
    'text/plain; charset=utf-8'
  )
  expect(await responseFromListener.text()).toBe('get-request-body')
})

it('intercepts a POST request', async () => {
  const response = await supertest(app)
    .post('/resource')
    .set('Content-Type', 'application/json')
    .send({ query: 'foo' })

  expect(response.error).toBeFalsy()
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ query: 'foo' })

  // Must call the "request" listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const [{ request }] = requestListener.mock.calls[0]
  expect(request.method).toBe('POST')
  expect(await request.json()).toEqual({ query: 'foo' })

  // Must call the "response" listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [{ response: responseFromListener }] = responseListener.mock.calls[0]
  expect(responseFromListener.status).toBe(200)
  expect(responseFromListener.statusText).toBe('OK')
  expect(responseFromListener.headers.get('content-type')).toBe(
    'application/json; charset=utf-8'
  )
  expect(await responseFromListener.json()).toEqual({ query: 'foo' })
})
