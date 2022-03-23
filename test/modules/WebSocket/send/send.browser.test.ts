import path from 'path'
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

it('sends data from the connection', async () => {
  const runtime = await prepareRuntime()

  await runtime.page.evaluate(() => {
    const socket = new WebSocket('wss://example.com')
    socket.addEventListener('message', (event) => {
      console.log(event.data)
    })
    window.sockets.push(socket)
    return new Promise((resolve) => (socket.onopen = resolve))
  })

  await runtime.page.evaluate(() => {
    window.connections[0].send('hello from server')
  })

  expect(runtime.consoleSpy.get('log')).toEqual(['hello from server'])
})

it('sends data from the connection in response to client data', async () => {
  const runtime = await prepareRuntime()

  await runtime.page.evaluate(() => {
    const socket = new WebSocket('wss://example.com')
    socket.addEventListener('message', (event) => {
      console.log(event.data)
    })
    window.sockets.push(socket)
    return new Promise((resolve) => (socket.onopen = resolve))
  })

  await runtime.page.evaluate(() => {
    const [connection] = window.connections
    connection.on('message', (event) => {
      connection.send(`no, you are ${event.data}`)
    })
  })

  await runtime.page.evaluate(() => {
    window.sockets[0].send('gorgeous')
  })

  expect(runtime.consoleSpy.get('log')).toEqual(['no, you are gorgeous'])
})
