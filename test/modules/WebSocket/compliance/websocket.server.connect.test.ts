// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { Data, WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { getWsUrl } from '../utils/getWsUrl'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('forwards client messages to the server by default', async () => {
  const messageListener = vi.fn<(data: Data) => void>()

  wsServer.once('connection', (ws) => {
    ws.addEventListener('message', (event) => {
      messageListener(event.data)

      if (event.data === 'howdy') {
        ws.close()
      }
    })
  })

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  ws.onopen = () => {
    ws.send('hello')
    ws.send('howdy')
  }
  await waitForWebSocketEvent('close', ws)

  expect(messageListener).toHaveBeenCalledWith('hello')
  expect(messageListener).toHaveBeenCalledWith('howdy')
  expect(messageListener).toHaveBeenCalledTimes(2)
})

it('prevents client-to-server forwarding by calling "event.preventDefault()"', async () => {
  const messageListener = vi.fn<(data: Data) => void>()

  wsServer.once('connection', (ws) => {
    ws.addEventListener('message', (event) => {
      messageListener(event.data)

      if (event.data === 'howdy') {
        ws.close()
      }
    })
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    client.addEventListener('message', (event) => {
      if (event.data === 'prevent-this') {
        event.preventDefault()
      }
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  ws.onopen = () => {
    ws.send('hello')
    ws.send('prevent-this')
    ws.send('howdy')
  }
  await waitForWebSocketEvent('close', ws)

  expect(messageListener).toHaveBeenCalledWith('hello')
  expect(messageListener).toHaveBeenCalledWith('howdy')
  expect(messageListener).not.toHaveBeenCalledWith('prevent-this')
})
