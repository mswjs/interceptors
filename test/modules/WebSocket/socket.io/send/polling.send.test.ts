/**
 * @jest-environment node
 */
import io from 'socket.io-client'
import { WebSocketServer } from '@open-draft/test-server/ws'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()
const wsServer = new WebSocketServer()

beforeAll(async () => {
  await wsServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await wsServer.close()
})

it.skip('sends data from the connection', async () => {
  const wssUrl = wsServer.wss.address.href

  interceptor.on('connection', (socket) => {
    socket.send('hello from server')
  })

  const socket = io(wssUrl, {
    transports: ['polling'],
    reconnection: false,
    rejectUnauthorized: false,
  })

  const clientMessageListener = jest.fn()
  socket.on('mesasge', clientMessageListener)

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', resolve)
    socket.on('error', reject)
  })

  expect(clientMessageListener).toHaveBeenCalledWith('hello from server')
  expect(clientMessageListener).toHaveBeenCalledTimes(1)
})
