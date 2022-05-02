/**
 * @jest-environment node
 */
import io from 'socket.io-client'
import { WebSocketServer } from '@open-draft/test-server/ws'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'
import waitForExpect from 'wait-for-expect'

const interceptor = new WebSocketInterceptor()
const wsServer = new WebSocketServer()

beforeAll(async () => {
  await wsServer.listen()
})

beforeEach(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.dispose()
})

afterAll(async () => {
  await wsServer.close()
})

it.only('intercepts message events sent from the client', async () => {
  const wsUrl = wsServer.ws.address.href

  const messageListener = jest.fn()
  interceptor.on('connection', (socket) => {
    socket.on('message', messageListener)
  })

  const socket = io(wsUrl, {
    transports: ['polling'],
  })

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', resolve)
    socket.on('error', reject)
  })

  socket.send('hello')
  socket.disconnect()

  expect(messageListener).toHaveBeenCalledWith('hello')
  expect(messageListener).toHaveBeenCalledTimes(1)
})

it.skip('intercepts custom events sent from the client', async () => {
  const wsUrl = wsServer.ws.address.href

  const messageListener = jest.fn()
  interceptor.on('connection', (socket) => {
    socket.on('greet', messageListener)
  })

  const socket = io(wsUrl, {
    transports: ['polling'],
  })

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', resolve)
    socket.on('error', reject)
  })

  socket.emit('greet', 'Sedrick')
  // socket.disconnect()

  await waitForExpect(() => {
    expect(messageListener).toHaveBeenCalledWith('Sedrick')
    expect(messageListener).toHaveBeenCalledTimes(1)
  })
})
