// @vitest-environment node
import net from 'node:net'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { SocketInterceptor } from '../../../src/interceptors/net'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('emulates socket connect event', async () => {
  interceptor.on('connection', ({ socket }) => {
    socket.emit('connect')
  })

  const connectionListener = vi.fn()
  const socket = net.connect(443, '127.0.0.1', connectionListener)

  await expect.poll(() => connectionListener).toHaveBeenCalledOnce()
  expect.soft(socket.connecting).toBe(false)
  expect.soft(socket.readyState).toBe('open')
})

it('spies on written packets', async () => {
  const writeListener = vi.fn()
  interceptor.on('connection', ({ socket }) => {
    socket.on('write', writeListener)
  })

  const socket = net.connect(443, '127.0.0.1')
  socket.write('hello')
  socket.write(' ')
  socket.write('world')

  expect.soft(writeListener).toHaveBeenCalledTimes(3)
  expect
    .soft(writeListener)
    .toHaveBeenNthCalledWith(1, 'hello', undefined, undefined)
  expect
    .soft(writeListener)
    .toHaveBeenNthCalledWith(2, ' ', undefined, undefined)
  expect
    .soft(writeListener)
    .toHaveBeenNthCalledWith(3, 'world', undefined, undefined)
})

it('supports pushing data to the socket', async () => {
  interceptor.on('connection', ({ socket }) => {
    socket.push('hello')
    socket.push(' ')
    socket.push('world')
  })

  const socket = net.connect(443, '127.0.0.1')
  const dataListener = vi.fn()
  socket.on('data', dataListener)

  await expect.poll(() => dataListener).toHaveBeenCalled()
  expect.soft(dataListener).toHaveBeenCalledTimes(3)
  expect.soft(dataListener).toHaveBeenNthCalledWith(1, Buffer.from('hello'))
  expect.soft(dataListener).toHaveBeenNthCalledWith(2, Buffer.from(' '))
  expect.soft(dataListener).toHaveBeenNthCalledWith(3, Buffer.from('world'))
})

it('establishes passthrough', async () => {
  interceptor.on('connection', ({ socket }) => {
    socket.passthrough()
  })

  const socket = net.connect(443, '127.0.0.1')
  const errorListener = vi.fn()
  socket.on('error', errorListener)

  await expect
    .poll(() => errorListener)
    .toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:443',
      })
    )
})
