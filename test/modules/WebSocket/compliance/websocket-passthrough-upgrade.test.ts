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

it('does not intercept a passthrough upgrade with a fresh connection pool', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

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

  using connection = {
    socket: new WebSocket(server.ws.url('?greet')),
    [Symbol.dispose]() {
      this.socket.close()
    },
  }
  const { socket } = connection
  socket.addEventListener('message', (event) => {
    message.resolve(event.data)
  })
  socket.addEventListener('error', () => {
    message.reject(new Error('WebSocket connection failed'))
  })

  await expect(message.promise).resolves.toBe('hello world')
  expect(connectionListener).toHaveBeenCalledOnce()
  expect(requestListener).not.toHaveBeenCalled()
})

it('does not intercept a passthrough upgrade with a mocked connection pool', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

  httpInterceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })
  const url = server.ws.url()
  url.protocol = 'http:'
  const response = await fetch(url)
  expect(await response.text()).toBe('mocked')

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

  using connection = {
    socket: new WebSocket(server.ws.url('?greet')),
    [Symbol.dispose]() {
      this.socket.close()
    },
  }
  const { socket } = connection
  socket.addEventListener('message', (event) => {
    message.resolve(event.data)
  })
  socket.addEventListener('error', () => {
    message.reject(new Error('WebSocket connection failed'))
  })

  await expect(message.promise).resolves.toBe('hello world')
  expect(connectionListener).toHaveBeenCalledOnce()
  expect(requestListener).not.toHaveBeenCalled()
})

it('intercepts HTTP requests made from a passthrough open listener', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

  const responseBody = Promise.withResolvers<string>()
  const requestListener = vi.fn()
  httpInterceptor.on('request', ({ request, controller }) => {
    requestListener(request.url)
    controller.respondWith(new Response('intercepted'))
  })

  webSocketInterceptor.on('connection', ({ client, server }) => {
    server.connect()
    server.addEventListener('open', () => {
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

  using connection = {
    socket: new WebSocket(server.ws.url('?greet')),
    [Symbol.dispose]() {
      this.socket.close()
    },
  }

  await expect(responseBody.promise).resolves.toBe('intercepted')
  expect(requestListener).toHaveBeenCalledOnce()
})

it('intercepts HTTP requests made from a passthrough message listener', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

  const responseBody = Promise.withResolvers<string>()
  const requestListener = vi.fn()
  httpInterceptor.on('request', ({ request, controller }) => {
    requestListener(request.url)
    controller.respondWith(new Response('intercepted'))
  })

  webSocketInterceptor.on('connection', ({ client, server }) => {
    server.connect()
    server.addEventListener('message', () => {
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

  using connection = {
    socket: new WebSocket(server.ws.url('?greet')),
    [Symbol.dispose]() {
      this.socket.close()
    },
  }

  await expect(responseBody.promise).resolves.toBe('intercepted')
  expect(requestListener).toHaveBeenCalledOnce()
})

it('passes through concurrent connections without connection listeners', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

  const requestListener = vi.fn()
  httpInterceptor.on('request', requestListener)
  using connections = {
    sockets: Array.from({ length: 3 }, () => {
      return new WebSocket(server.ws.url('?greet'))
    }),
    [Symbol.dispose]() {
      for (const socket of this.sockets) {
        socket.close()
      }
    },
  }

  await Promise.all(
    connections.sockets.map((socket) => {
      const message = new Promise<string>((resolve, reject) => {
        socket.addEventListener('message', (event) => {
          resolve(event.data)
        })
        socket.addEventListener('error', () => {
          reject(new Error('WebSocket connection failed'))
        })
      })
      return expect(message).resolves.toBe('hello world')
    })
  )
  expect(requestListener).not.toHaveBeenCalled()
})

it('passes through secure WebSockets using the configured dispatcher', async () => {
  using interceptors = {
    webSocketInterceptor: new WebSocketInterceptor(),
    httpInterceptor: new HttpRequestInterceptor(),
    [Symbol.dispose]() {
      this.httpInterceptor.dispose()
      this.webSocketInterceptor.dispose()
    },
  }
  const { webSocketInterceptor, httpInterceptor } = interceptors
  webSocketInterceptor.apply()
  httpInterceptor.apply()

  await using secureServer = await createRawTestServer(() => {
    return https.createServer({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })
  using webSocketServer = {
    instance: new WebSocketServer({ server: secureServer.instance }),
    [Symbol.dispose]() {
      for (const socket of this.instance.clients) {
        socket.terminate()
      }
      this.instance.close()
    },
  }
  webSocketServer.instance.on('connection', (socket) => {
    socket.send('secure greeting')
  })

  await using dispatcher = {
    original: getGlobalDispatcher(),
    instance: new Agent({ connect: { ca: TLS_CERTIFICATE } }),
    async [Symbol.asyncDispose]() {
      setGlobalDispatcher(this.original)
      await this.instance.destroy()
    },
  }
  setGlobalDispatcher(dispatcher.instance)

  const requestListener = vi.fn()
  httpInterceptor.on('request', requestListener)
  webSocketInterceptor.on('connection', ({ server }) => {
    server.connect()
  })

  using connection = {
    socket: new WebSocket(`wss://localhost:${secureServer.port}`),
    [Symbol.dispose]() {
      this.socket.close()
    },
  }
  const message = new Promise<string>((resolve, reject) => {
    connection.socket.addEventListener('message', (event) => {
      resolve(event.data)
    })
    connection.socket.addEventListener('error', () => {
      reject(new Error('Secure WebSocket connection failed'))
    })
  })

  await expect(message).resolves.toBe('secure greeting')
  expect(requestListener).not.toHaveBeenCalled()
})
