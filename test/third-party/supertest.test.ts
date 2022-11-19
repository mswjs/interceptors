/**
 * @jest-environment jsdom
 */
import express from 'express'
import supertest from 'supertest'
import { HttpRequestEventMap } from '../../src'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const requestListener = jest.fn<
  ReturnType<HttpRequestEventMap['request']>,
  Parameters<HttpRequestEventMap['request']>
>()
const responseListener = jest.fn<
  ReturnType<HttpRequestEventMap['response']>,
  Parameters<HttpRequestEventMap['response']>
>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', requestListener)
interceptor.on('response', responseListener)

const app = express()

app.use(express.json())
app.post('/', (req, res) => {
  res.status(200).json(req.body)
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(() => {
  interceptor.dispose()
})

test('preserves original POST request JSON body', async () => {
  const response = await supertest(app)
    .post('/')
    .set('Content-Type', 'application/json')
    .send({ query: 'foo' })

  expect(response.error).toBeFalsy()
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ query: 'foo' })

  // Must call the "request" listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const [request] = requestListener.mock.calls[0]
  expect(request.method).toBe('POST')
  expect(await request.json()).toEqual({ query: 'foo' })

  // Must call the "response" listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [responseFromListener] = responseListener.mock.calls[0]
  expect(responseFromListener.status).toBe(200)
  expect(responseFromListener.statusText).toBe('OK')
  expect(responseFromListener.headers.get('content-type')).toBe(
    'application/json; charset=utf-8'
  )
  expect(await responseFromListener.json()).toEqual({ query: 'foo' })
})
