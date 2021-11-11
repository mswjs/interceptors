/**
 * @jest-environment jsdom
 */
import express from 'express'
import supertest from 'supertest'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { IsomorphicRequest } from '../../src/createInterceptor'

let requests: IsomorphicRequest[] = []

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(req) {
    requests.push(req)
  },
})

const app = express()
app.use(express.json())
app.post('/', (req, res) => {
  res.status(200).json(req.body)
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(() => {
  interceptor.restore()
})

test('preserves original POST request JSON body', async () => {
  const res = await supertest(app)
    .post('/')
    .set('Content-Type', 'application/json')
    .send({ query: 'foo' })

  expect(res.error).toBeFalsy()
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ query: 'foo' })

  expect(requests).toHaveLength(1)
  const [request] = requests
  expect(request.method).toBe('POST')
  expect(request.body).toEqual(JSON.stringify({ query: 'foo' }))
})
