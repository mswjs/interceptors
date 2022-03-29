/**
 * @jest-environment node
 */
import * as path from 'path'
import { io as socketClient } from 'socket.io-client'
import { ServerApi, createServer } from '@open-draft/test-server'
import { pageWith } from 'page-with'
import { WebSocketConnection } from '../../../../src/interceptors/WebSocket/browser/WebSocketConnection'

declare namespace window {
  export const io: typeof socketClient
  export const sockets: WebSocket[]
  export const connections: WebSocketConnection[]
}

let testServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../websocket.runtime.js'),
  })
}

beforeAll(async () => {
  testServer = await createServer()
})

afterAll(async () => {
  await testServer.close()
})

it('intercepts data sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.ws.address.toString()

  await runtime.page.evaluate((wsUrl) => {
    return new Promise((resolve) => {
      const socket = window.io(wsUrl)
      // window.sockets.push(socket)
      // socket.addEventListener('open', resolve)
    })
  }, wsUrl)

  await runtime.page.evaluate(() => {
    window.sockets[0].send('hello world')
  })
  expect(runtime.consoleSpy.get('log')).toContain('hello world')

  await runtime.page.evaluate(() => {
    window.sockets[0].send('second message')
  })
  expect(runtime.consoleSpy.get('log')).toContain('second message')
})

it.only('intercepts data sent from the server', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.ws.address.toString()

  await runtime.page.evaluate((wsUrl) => {
    return new Promise((resolve) => {
      console.log('constructing io client...')
      const socket = window.io(wsUrl, {
        transports: ['websocket'],
        timeout: 3000,
        reconnection: false,
      })

      socket.on('greet', (data) => {
        console.log('> GREET FROM SERVER:', data)
      })

      socket.on('message', (...args) => {
        console.log('> from server:', ...args)
      })

      socket.on('connect', () => {
        console.warn('socket connected!')
      })

      socket.on('disconnect', (...args) => {
        console.warn('socket disconnected', ...args)
      })

      socket.on('error', console.error)
      socket.on('connect_error', console.error)
      socket.on('timeout', console.error)

      // @ts-ignore
      window.socket = socket
    })
  }, wsUrl)

  console.log(testServer.ws.address.toString())

  testServer.ws.instance.on('connection', () => {
    console.log('NEW CLIENT CONNECTED')
  })

  // setInterval(() => {
  //   testServer.ws.instance.send('hello from server')
  //   testServer.ws.instance.emit('data', 'foo')
  // }, 1000)

  await runtime.debug()

  expect(runtime.consoleSpy.get('log')).toBe(['hello from server'])
}, 9999999)

it('intercepts data sent by multiple clients', async () => {
  const runtime = await prepareRuntime()

  await runtime.page.evaluate(() => {
    return new Promise((resolve) => {
      const firstSocket = new WebSocket('wss://example.com')
      const secondSocket = new WebSocket('ws://127.0.0.1/ws')
      window.sockets.push(firstSocket, secondSocket)

      firstSocket.addEventListener('open', () => {
        secondSocket.addEventListener('open', resolve)
      })
    })
  })

  await runtime.page.evaluate(() => {
    window.connections.forEach((connection) => {
      connection.on('message', (event) => {
        // console.log(`${event.data} ${connection.client.url}`)
      })
    })
  })

  await runtime.page.evaluate(() => {
    window.sockets[0].send('first')
    window.sockets[1].send('second')
  })

  expect(runtime.consoleSpy.get('log')).toEqual([
    'first wss://example.com',
    'second ws://127.0.0.1/ws',
  ])
})
