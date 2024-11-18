// @vitest-environment node-with-websocket
import { beforeAll, afterEach, afterAll, vi, it, expect } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('buffers client sends until the connection is open', async () => {
  const events: Array<string> = []

  interceptor.on('connection', ({ client }) => {
    client.socket.addEventListener('open', () => {
      events.push('open')
    })
    client.socket.addEventListener('message', () => {
      events.push('send')
    })

    client.send('hello world')
  })

  const socket = new WebSocket('ws://localhost')
  const messageListener = vi.fn()
  socket.addEventListener('message', messageListener)

  await vi.waitFor(() => {
    expect(messageListener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'hello world',
      })
    )
  })

  expect(events).toEqual(['open', 'send'])
})

it('does not send data if the client connection is closing', async () => {
  const events: Array<string> = []

  interceptor.on('connection', ({ client }) => {
    client.socket.addEventListener('close', () => {
      events.push('close')
    })
    client.socket.addEventListener('message', () => {
      events.push('send')
    })

    client.close()
    client.send('hello world')
  })

  const socket = new WebSocket('ws://localhost')
  const messageListener = vi.fn()
  const closeListener = vi.fn()
  socket.addEventListener('message', messageListener)
  socket.addEventListener('close', closeListener)

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledOnce()
  })

  expect(messageListener).not.toHaveBeenCalled()
  expect(events).toEqual(['close'])
})

it('does not send data if the client connection is closed', async () => {
  const events: Array<string> = []

  interceptor.on('connection', ({ client }) => {
    client.socket.addEventListener('close', () => {
      events.push('close')
    })
    client.socket.addEventListener('message', () => {
      events.push('send')
    })

    client.close()
    queueMicrotask(() => client.send('hello world'))
  })

  const socket = new WebSocket('ws://localhost')
  const messageListener = vi.fn()
  const closeListener = vi.fn()
  socket.addEventListener('message', messageListener)
  socket.addEventListener('close', closeListener)

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledOnce()
  })

  expect(messageListener).not.toHaveBeenCalled()
  expect(events).toEqual(['close'])
})
