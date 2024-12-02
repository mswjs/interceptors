/**
 * @see https://github.com/mswjs/interceptors/issues/682
 */
// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import net from 'node:net'
import { Server } from 'socket.io'
import { io } from 'socket.io-client'
// import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

// const interceptor = new ClientRequestInterceptor()
const server = new Server(51679)

beforeAll(() => {
  // interceptor.apply()
})

afterEach(() => {
  // interceptor.removeAllListeners()
})

afterAll(async () => {
  // interceptor.dispose()
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

      if (args[0] === 'agentRemove') {
        debugger
      }

      if (args[0] === 'data') {
        // if (args[1].toString().includes('HTTP/1.1 101 Switching Protocols')) {
        //   debugger
        // }

        console.log(
          `
  UTF: ${args[1].toString()}
  HEX: ${args[1].toString('hex')}
  `,
          '\n\n'
        )
      }

      return Reflect.apply(target, thisArg, args)
    },
  })

  //   net.Socket.prototype.write = new Proxy(net.Socket.prototype.write, {
  //     apply(target, thisArg, args) {
  //       console.trace(`WRITE!
  // UTF: ${args[0].toString()}
  // HEX: ${args[0].toString('hex')}
  // `)

  //       return Reflect.apply(target, thisArg, args)
  //     },
  //   })

  const client = io(`http://localhost:51679`, {
    transports: ['websocket'],
    reconnection: false,
    retries: 0,
  })

  await vi.waitFor(
    async () => {
      expect(client.connected).toBe(true)
    },
    { timeout: 100_000 }
  )

  console.log('----')
}, 100_000)
