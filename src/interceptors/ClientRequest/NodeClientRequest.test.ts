import { EventEmitter } from 'events'
import { ServerApi, createServer } from '@open-draft/test-server'
import { NodeClientRequest } from './NodeClientRequest'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

interface ErrorConnectionRefused extends NodeJS.ErrnoException {
  address: string
  port: number
}

let httpServer: ServerApi

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/comment', (req, res) => {
      res.status(200).send('original-response')
    })
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('gracefully finishes the request with a mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://any.thing', {
      method: 'PUT',
    }),
    {
      observer: new EventEmitter(),
      resolver() {
        return {
          status: 301,
          headers: {
            'x-custom-header': 'yes',
          },
          body: 'mocked-response',
        }
      },
    }
  )

  request.on('response', async (response) => {
    // Request must be marked as finished.
    expect(request.finished).toEqual(true)
    expect(request.writableEnded).toEqual(true)
    expect(request.writableFinished).toEqual(true)
    expect(request.writableCorked).toEqual(0)

    expect(response.statusCode).toEqual(301)
    expect(response.headers).toHaveProperty('x-custom-header', 'yes')

    const responseBody = await getIncomingMessageBody(response)
    expect(responseBody).toEqual('mocked-response')

    done()
  })

  request.end()
})

test('performs the request as-is given resolver returned no mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.makeUrl('/comment'), {
      method: 'POST',
    }),
    {
      observer: new EventEmitter(),
      resolver() {},
    }
  )

  request.on('response', async (response) => {
    expect(request.finished).toEqual(true)
    expect(request.writableEnded).toEqual(true)

    expect(response.statusCode).toEqual(200)
    expect(response.statusMessage).toEqual('OK')
    expect(response.headers).toHaveProperty('x-powered-by', 'Express')

    const responseBody = await getIncomingMessageBody(response)
    expect(responseBody).toEqual('original-response')
    done()
  })

  request.end()
})

test('emits the ECONNREFUSED error when connecting to a non-existing URL', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://localhost:12345/non-existing'),
    {
      observer: new EventEmitter(),
      resolver() {},
    }
  )

  request.on('error', (error: ErrorConnectionRefused) => {
    expect(error.code).toEqual('ECONNREFUSED')
    expect(error.syscall).toEqual('connect')
    expect(error.address).toEqual('127.0.0.1')
    expect(error.port).toEqual(12345)

    done()
  })
})
