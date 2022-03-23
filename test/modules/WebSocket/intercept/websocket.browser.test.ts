/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { WebSocketConnection } from '../../../../src/interceptors/WebSocket/browser/WebSocketOverride'

declare namespace window {
  export const sockets: WebSocket[]
  export const connections: WebSocketConnection[]
}

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../websocket.runtime.js'),
  })
}

it('intercepts data sent by the connected client', async () => {
  const runtime = await prepareRuntime()

  await runtime.page.evaluate(() => {
    return new Promise((resolve) => {
      const socket = new WebSocket('wss://example.com')
      window.sockets.push(socket)
      socket.addEventListener('open', resolve)
    })
  })

  await runtime.page.evaluate(() => {
    window.connections[0].on('message', (event) => {
      console.log(event.data)
    })
  })

  await runtime.page.evaluate(() => {
    window.sockets[0].send('hello world')
  })
  expect(runtime.consoleSpy.get('log')).toContain('hello world')

  await runtime.page.evaluate(() => {
    window.sockets[0].send('second message')
  })
  expect(runtime.consoleSpy.get('log')).toContain('second message')
})

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
        console.log(`${event.data} ${connection.client.url}`)
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
