/**
 * @jest-environment jsdom
 */
import express from 'express'
import { https } from 'follow-redirects'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { IsomorphicRequest } from '../../src/glossary'

let requests: IsomorphicRequest[] = []

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  requests.push(request)
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
  interceptor.dispose()
})

test('preserves original POST request JSON body', async () => {
  const data = JSON.stringify({ todo: 'Buy the milk' })

  const options = {
    hostname: 'localhost',
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  }

  const req = https.request(options, (res) => {
    console.log(`statusCode: ${res.statusCode}`)

    res.on('data', (d) => {
      process.stdout.write(d)
    })
  })

  req.on('error', (error) => {
    console.error(error)
  })

  req.end(data)

  expect(requests).toHaveLength(1)
  const [request] = requests
  expect(request.method).toBe('POST')
  expect(request.body).toEqual(JSON.stringify({ todo: 'Buy the milk' }))
})
