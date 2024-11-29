/**
 * @see https://github.com/mswjs/interceptors/issues/682
 */
// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import net from 'node:net'
import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()
const server = new Server(51678)

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await new Promise<void>((resolve, reject) => {
    server.disconnectSockets()
    server.close((error) => {
      if (error) reject(error)
      resolve()
    })
  })
})

it('bypasses a WebSocket upgrade request', async () => {
  net.Socket.prototype.emit = new Proxy(net.Socket.prototype.emit, {
    apply(target, thisArg, args) {
      console.log('EMIT!', args[0])

      if (args[0] === 'data') {
        console.log(args[1].toString(), '\n\n')
      }

      return Reflect.apply(target, thisArg, args)
    },
  })
  net.Socket.prototype.write = new Proxy(net.Socket.prototype.write, {
    apply(target, thisArg, args) {
      console.log('WRITE!', args[0].toString())

      return Reflect.apply(target, thisArg, args)
    },
  })

  interceptor.on('request', ({ request }) => {
    console.log(request.method, request.url, Array.from(request.headers))
  })

  // http.get('http://example.com/')

  const client = io(`http://localhost:51678`, {
    transports: ['websocket'],
  })

  await vi.waitFor(async () => {
    expect(client.connected).toBe(true)
  })

  console.log('----')
})
