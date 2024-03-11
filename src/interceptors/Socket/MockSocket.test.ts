/**
 * @vitest-environment node
 */
import { vi, it, expect } from 'vitest'
import { MockSocket } from './MockSocket'

it(`keeps the socket connecting until it's destroyed`, () => {
  const socket = new MockSocket({
    write: vi.fn(),
    read: vi.fn(),
  })

  expect(socket.connecting).toBe(true)

  socket.destroy()
  expect(socket.connecting).toBe(false)
})

it('calls the "write" on "socket.write()"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.write()
  expect(writeCallback).toHaveBeenCalledWith(undefined, undefined, undefined)
})

it('calls the "write" on "socket.write(chunk)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.write('hello')
  expect(writeCallback).toHaveBeenCalledWith('hello', undefined, undefined)
})

it('calls the "write" on "socket.write(chunk, encoding)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.write('hello', 'utf8')
  expect(writeCallback).toHaveBeenCalledWith('hello', 'utf8', undefined)
})

it('calls the "write" on "socket.write(chunk, encoding, callback)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  const callback = vi.fn()
  socket.write('hello', 'utf8', callback)
  expect(writeCallback).toHaveBeenCalledWith('hello', 'utf8', callback)
})

it('calls the "write" on "socket.end()"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.end()
  expect(writeCallback).toHaveBeenCalledWith(undefined, undefined, undefined)
})

it('calls the "write" on "socket.end(chunk)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.end('final')
  expect(writeCallback).toHaveBeenCalledWith('final', undefined, undefined)
})

it('calls the "write" on "socket.end(chunk, encoding)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.end('final', 'utf8')
  expect(writeCallback).toHaveBeenCalledWith('final', 'utf8', undefined)
})

it('calls the "write" on "socket.end(chunk, encoding, callback)"', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  const callback = vi.fn()
  socket.end('final', 'utf8', callback)
  expect(writeCallback).toHaveBeenCalledWith('final', 'utf8', callback)
})

it('calls the "write" on "socket.end()" without any arguments', () => {
  const writeCallback = vi.fn()
  const socket = new MockSocket({
    write: writeCallback,
    read: vi.fn(),
  })

  socket.end()
  expect(writeCallback).toHaveBeenCalledWith(undefined, undefined, undefined)
})

it('calls the "read" on "socket.read(chunk)"', () => {
  const readCallback = vi.fn()
  const socket = new MockSocket({
    write: vi.fn(),
    read: readCallback,
  })

  socket.push('hello')
  expect(readCallback).toHaveBeenCalledWith('hello', undefined)
})

it('calls the "read" on "socket.read(chunk, encoding)"', () => {
  const readCallback = vi.fn()
  const socket = new MockSocket({
    write: vi.fn(),
    read: readCallback,
  })

  socket.push('world', 'utf8')
  expect(readCallback).toHaveBeenCalledWith('world', 'utf8')
})

it('calls the "read" on "socket.read(null)"', () => {
  const readCallback = vi.fn()
  const socket = new MockSocket({
    write: vi.fn(),
    read: readCallback,
  })

  socket.push(null)
  expect(readCallback).toHaveBeenCalledWith(null, undefined)
})

it('updates the readable/writable state on "socket.end()"', async () => {
  const socket = new MockSocket({
    write: vi.fn(),
    read: vi.fn(),
  })

  expect(socket.writable).toBe(true)
  expect(socket.writableEnded).toBe(false)
  expect(socket.writableFinished).toBe(false)
  expect(socket.readable).toBe(true)
  expect(socket.readableEnded).toBe(false)

  socket.write('hello')
  socket.end()

  expect(socket.writable).toBe(false)
  expect(socket.writableEnded).toBe(true)
  expect(socket.readable).toBe(true)

  await vi.waitFor(() => {
    socket.once('finish', () => {
      expect(socket.writableFinished).toBe(true)
    })
  })

  await vi.waitFor(() => {
    socket.once('end', () => {
      expect(socket.readableEnded).toBe(true)
    })
  })
})

it('updates the readable/writable state on "socket.destroy()"', async () => {
  const socket = new MockSocket({
    write: vi.fn(),
    read: vi.fn(),
  })

  expect(socket.writable).toBe(true)
  expect(socket.writableEnded).toBe(false)
  expect(socket.writableFinished).toBe(false)
  expect(socket.readable).toBe(true)

  socket.destroy()

  expect(socket.writable).toBe(false)
  // The ".end()" wasn't called.
  expect(socket.writableEnded).toBe(false)
  expect(socket.readable).toBe(false)

  await vi.waitFor(() => {
    socket.once('finish', () => {
      expect(socket.writableFinished).toBe(true)
    })
  })

  await vi.waitFor(() => {
    socket.once('end', () => {
      expect(socket.readableEnded).toBe(true)
    })
  })
})
