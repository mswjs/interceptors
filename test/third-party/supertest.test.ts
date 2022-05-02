/**
 * @jest-environment jsdom
 */
import express from 'express'
import supertest from 'supertest'
import type { InteractiveIsomorphicRequest } from '../../src/glossary'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'

const requestListener = jest.fn<never, [InteractiveIsomorphicRequest]>()

const interceptor = new ClientRequestInterceptor(Symbol('supertest-http'))
interceptor.on('request', (request) => {
  requestListener(request)
})

Object.defineProperty(requestListener, 'name', {
  value: 'SUPERTEST_REQUEST_LISTENER',
  writable: false,
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
  const app = express()
  app.use(express.json())
  app.post('/', (req, res) => {
    res.status(200).json(req.body)
  })
  const res = await supertest(app)
    .post('/')
    .set('Content-Type', 'application/json')
    .send({ query: 'foo' })

  expect(res.error).toBeFalsy()
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ query: 'foo' })

  expect(requestListener.mock.calls).toEqual([
    [
      expect.objectContaining<Partial<InteractiveIsomorphicRequest>>({
        method: 'POST',
        body: JSON.stringify({ query: 'foo' }),
      }),
    ],
  ])
})
