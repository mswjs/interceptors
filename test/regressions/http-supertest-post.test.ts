import express from 'express'
import bodyParser from 'body-parser'
import supertest from 'supertest'
import { createInterceptor } from '../../src'
import { interceptClientRequest } from '../../src/interceptors/ClientRequest'
import { IsomorphicRequest } from '../../src/createInterceptor'

let pool: IsomorphicRequest[] = []

const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(request) {
    pool.push(request)
  },
})

const app = express()
app.use(bodyParser.json())
app.post('/', (req, res) => {
  res.status(200).json(req.body)
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  pool = []
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

  expect(pool).toHaveLength(1)
  expect(pool[0].method).toBe('POST')
  expect(pool[0].body).toEqual(JSON.stringify({ query: 'foo' }))
})
