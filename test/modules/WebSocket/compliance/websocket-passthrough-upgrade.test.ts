// @vitest-environment node
import { createHash } from 'node:crypto'
import https from 'node:https'
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { FetchResponse } from '#/src/utils/fetch-utils'
import { getTestServer } from '#/test/setup/vitest'
import { createRawTestServer } from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

const server = getTestServer()
const webSocketInterceptor = new WebSocketInterceptor()
const httpInterceptor = new HttpRequestInterceptor()

beforeAll(() => {
  webSocketInterceptor.apply()
  httpInterceptor.apply()
})

afterEach(() => {
  webSocketInterceptor.removeAllListeners()
  httpInterceptor.removeAllListeners()
})

afterAll(() => {
  httpInterceptor.dispose()
  webSocketInterceptor.dispose()
})

it.each(['fresh', 'mocked'])(
  'does not intercept a passthrough upgrade with a %s connection pool',
  async (pool) => {
    if (pool === 'mocked') {
      httpInterceptor.once('request', ({ controller }) => {
        controller.respondWith(new Response('mocked'))
      })
      const url = server.ws.url()
      url.protocol = 'http:'
      const response = await fetch(url)
      expect(await response.text()).toBe('mocked')
    }

    const message = Promise.withResolvers<string>()
    const connectionListener = vi.fn()
    const requestListener = vi.fn()

    webSocketInterceptor.on('connection', ({ client, server }) => {
      connectionListener()

      // Stop at the first recursive connection so the regression fails
      // deterministically instead of creating an unbounded connection loop.
      if (connectionListener.mock.calls.length > 1) {
        client.close()
        message.reject(
          new Error('Passthrough upgrade re-entered WebSocket interception')
        )
        return
      }

      server.connect()
    })

    httpInterceptor.on('request', ({ request, controller }) => {
      requestListener()
      const key = request.headers.get('sec-websocket-key')

      if (request.headers.get('upgrade') === 'websocket' && key) {
        // Model an HTTP upgrade handler that delegates to WebSocket interception.
        controller.respondWith(
          new FetchResponse(null, {
            status: 101,
            headers: {
              connection: 'Upgrade',
              upgrade: 'websocket',
              'sec-websocket-accept': createHash('sha1')
                .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
                .digest('base64'),
            },
          })
        )
        new WebSocket(request.url)
      }
    })

    const socket = new WebSocket(server.ws.url('?greet'))
    socket.addEventListener('message', (event) => {
      message.resolve(event.data)
    })
    socket.addEventListener('error', () => {
      message.reject(new Error('WebSocket connection failed'))
    })

    try {
      await expect(message.promise).resolves.toBe('hello world')
      expect(connectionListener).toHaveBeenCalledOnce()
      expect(requestListener).not.toHaveBeenCalled()
    } finally {
      socket.close()
    }
  }
)

it.each(['open', 'message'] as const)(
  'intercepts HTTP requests made from a passthrough %s listener',
  async (eventName) => {
    const responseBody = Promise.withResolvers<string>()
    const requestListener = vi.fn()
    httpInterceptor.on('request', ({ request, controller }) => {
      requestListener(request.url)
      controller.respondWith(new Response('intercepted'))
    })

    webSocketInterceptor.on('connection', ({ client, server }) => {
      server.connect()
      server.addEventListener(eventName, () => {
        // Use the same origin to ensure even a matching subsequent dial
        // cannot inherit the internal connection exemption.
        const url = new URL(client.url)
        url.protocol = 'http:'
        responseBody.resolve(
          fetch(url).then((response) => {
            return response.text()
          })
        )
      })
    })

    const socket = new WebSocket(server.ws.url('?greet'))

    try {
      await expect(responseBody.promise).resolves.toBe('intercepted')
      expect(requestListener).toHaveBeenCalledOnce()
    } finally {
      socket.close()
    }
  }
)

it('passes through concurrent connections without connection listeners', async () => {
  const requestListener = vi.fn()
  httpInterceptor.on('request', requestListener)
  const sockets = Array.from({ length: 3 }, () => {
    return new WebSocket(server.ws.url('?greet'))
  })

  try {
    await Promise.all(
      sockets.map((socket) => {
        return new Promise<void>((resolve, reject) => {
          socket.addEventListener('message', (event) => {
            expect(event.data).toBe('hello world')
            resolve()
          })
          socket.addEventListener('error', () => {
            reject(new Error('WebSocket connection failed'))
          })
        })
      })
    )
    expect(requestListener).not.toHaveBeenCalled()
  } finally {
    for (const socket of sockets) {
      socket.close()
    }
  }
})

it('passes through secure WebSockets using the configured dispatcher', async () => {
  await using secureServer = await createRawTestServer(() => {
    return https.createServer({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })
  const webSocketServer = new WebSocketServer({ server: secureServer.instance })
  webSocketServer.on('connection', (socket) => {
    socket.send('secure greeting')
  })

  const originalDispatcher = getGlobalDispatcher()
  const dispatcher = new Agent({ connect: { ca: TLS_CERTIFICATE } })
  setGlobalDispatcher(dispatcher)

  const requestListener = vi.fn()
  httpInterceptor.on('request', requestListener)
  webSocketInterceptor.on('connection', ({ server }) => {
    server.connect()
  })

  const socket = new WebSocket(`wss://localhost:${secureServer.port}`)
  const message = new Promise<string>((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      resolve(event.data)
    })
    socket.addEventListener('error', () => {
      reject(new Error('Secure WebSocket connection failed'))
    })
  })

  try {
    await expect(message).resolves.toBe('secure greeting')
    expect(requestListener).not.toHaveBeenCalled()
  } finally {
    socket.close()
    setGlobalDispatcher(originalDispatcher)
    await dispatcher.destroy()
    webSocketServer.close()
  }
})
