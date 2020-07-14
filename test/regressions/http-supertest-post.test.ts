import express from 'express'
import bodyParser from 'body-parser'
import supertest from 'supertest'
import { RequestInterceptor, InterceptedRequest } from '../../src'

let pool: InterceptedRequest[] = []
let interceptor: RequestInterceptor

const app = express()
app.use(bodyParser.json())
app.post('/', (req, res) => {
  res.status(200).json(req.body)
})

beforeAll(() => {
  interceptor = new RequestInterceptor()
  interceptor.use((req) => {
    pool.push(req)
  })
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
