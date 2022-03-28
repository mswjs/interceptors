/**
 * @jest-environment jsdom
 */
import { io } from 'socket.io-client'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptWebSocket } from '../../../../src/interceptors/WebSocket'

let testServer: ServerApi

const resolver = jest.fn()
const interceptor = createInterceptor({
  modules: [interceptWebSocket],
  resolver,
})

beforeAll(async () => {
  testServer = await createServer()

  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.restore()
  await testServer.close()
})

it('intercepts data sent from the client', async () => {
  const socket = io('wss://example.com')

  socket.send('hello world')
  //

  expect(resolver).toHaveBeenCalledWith({})
})
