/**
 * @jest-environment node
 */
import { EventEmitter } from 'events'
import * as express from 'express'
import { ServerApi, createServer } from '@open-draft/test-server'
import { NodeClientRequest } from './NodeClientRequest'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

interface ErrorConnectionRefused extends NodeJS.ErrnoException {
  address: string
  port: number
}

let httpServer: ServerApi

function waitFor(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  })
}

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.post('/comment', (_req, res) => {
      res.status(200).send('original-response')
    })

    app.post('/write', express.text(), (req, res) => {
      res.status(200).send(req.body)
    })
  })
})

afterAll(async () => {
  await httpServer.close()
})

test('gracefully finishes the request when it has a mocked response', (done) => {
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

    const text = await getIncomingMessageBody(response)
    expect(text).toEqual('mocked-response')

    done()
  })

  request.end()
})

test('responds with a mocked response when requesting an existing hostname', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.makeUrl('/comment')),
    {
      observer: new EventEmitter(),
      async resolver() {
        await waitFor(250)
        return {
          status: 201,
          body: 'mocked-response',
        }
      },
    }
  )

  request.on('response', async (response) => {
    expect(response.statusCode).toEqual(201)

    const text = await getIncomingMessageBody(response)
    expect(text).toEqual('mocked-response')

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

    const text = await getIncomingMessageBody(response)
    expect(text).toEqual('original-response')

    done()
  })

  request.end()
})

test('emits the ENOTFOUND error connecting to a non-existing hostname given no mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://non-existing-url.com'),
    {
      observer: new EventEmitter(),
      resolver() {},
    }
  )

  request.on('error', (error: NodeJS.ErrnoException) => {
    expect(error.code).toEqual('ENOTFOUND')
    expect(error.syscall).toEqual('getaddrinfo')
    done()
  })

  request.end()
})

test('emits the ECONNREFUSED error connecting to an inactive server given no mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://localhost:12345'),
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

  request.end()
})

test('does not emit ENOTFOUND error connecting to an inactive server given mocked response', (done) => {
  const handleError = jest.fn()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://non-existing-url.com'),
    {
      observer: new EventEmitter(),
      async resolver() {
        await waitFor(250)
        return {
          status: 200,
          statusText: 'Works',
        }
      },
    }
  )

  request.on('error', handleError)
  request.on('response', (response) => {
    expect(handleError).not.toHaveBeenCalled()
    expect(response.statusCode).toEqual(200)
    expect(response.statusMessage).toEqual('Works')
    done()
  })
  request.end()
})

test('does not emit ECONNREFUSED error connecting to an inactive server given mocked response', (done) => {
  const handleError = jest.fn()
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', 'http://localhost:9876'),
    {
      observer: new EventEmitter(),
      async resolver() {
        await waitFor(250)
        return {
          status: 200,
          statusText: 'Works',
        }
      },
    }
  )

  request.on('error', handleError)
  request.on('response', (response) => {
    expect(handleError).not.toHaveBeenCalled()
    expect(response.statusCode).toEqual(200)
    expect(response.statusMessage).toEqual('Works')
    done()
  })
  request.end()
})

test('sends the request body to the server given no mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.makeUrl('/write'), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
    }),
    {
      observer: new EventEmitter(),
      resolver() {},
    }
  )

  request.write('one')
  request.write('two')

  request.on('response', async (response) => {
    expect(response.statusCode).toEqual(200)

    const text = await getIncomingMessageBody(response)
    expect(text).toEqual('onetwothree')

    done()
  })

  request.end('three')
})

test('does not send request body to the original server given mocked response', (done) => {
  const request = new NodeClientRequest(
    normalizeClientRequestArgs('http:', httpServer.http.makeUrl('/write'), {
      method: 'POST',
    }),
    {
      observer: new EventEmitter(),
      async resolver() {
        await waitFor(200)
        return {
          status: 301,
          body: 'mock created!',
        }
      },
    }
  )

  request.write('one')
  request.write('two')

  request.on('response', async (response) => {
    expect(response.statusCode).toEqual(301)

    const text = await getIncomingMessageBody(response)
    expect(text).toEqual('mock created!')

    done()
  })

  request.end()
})
