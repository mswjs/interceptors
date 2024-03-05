/**
 * @vitest-environment node
 */
import { vi, beforeAll, afterEach, afterAll, it, expect } from 'vitest'
import net from 'node:net'
import { SocketInterceptor } from '../../../../src/interceptors/Socket/SocketInterceptor'

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

function spyOnEvents(socket: net.Socket): Array<unknown> {
  const events: Array<unknown> = []

  socket.emit = new Proxy(socket.emit, {
    apply(target, thisArg, args) {
      events.push(args)
      return Reflect.apply(target, thisArg, args)
    },
  })

  return events
}

function waitForSocketEvent(
  socket: net.Socket,
  event: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket
      .once(event, (data) => resolve(data))
      .once('error', (error) => reject(error))
  })
}

it('emits correct events for an HTTP connection', async () => {
  const connectionCallback = vi.fn()
  const socket = new net.Socket().connect(80, 'example.com', connectionCallback)
  const events = spyOnEvents(socket)

  await waitForSocketEvent(socket, 'connect')
  expect(events).toEqual([
    ['lookup', null, expect.any(String), 6, 'example.com'],
    ['connect'],
    ['ready'],
  ])

  socket.destroy()
  await waitForSocketEvent(socket, 'close')

  expect(events.slice(3)).toEqual([['close', false]])
  expect(connectionCallback).toHaveBeenCalledTimes(1)
})

it('emits correct events for a mocked keepalive HTTP request', async () => {
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('hello world'))
  })

  const connectionCallback = vi.fn()
  const socket = new net.Socket().connect(80, 'example.com', connectionCallback)
  const events = spyOnEvents(socket)

  await waitForSocketEvent(socket, 'connect')
  expect(events).toEqual([
    ['lookup', null, expect.any(String), 6, 'example.com'],
    ['connect'],
    ['ready'],
  ])

  socket.write('HEAD / HTTP/1.1\r\n')
  // Intentionally construct a keepalive request
  // (no "Connection: close" request header).
  socket.write('Host: example.com\r\n')
  socket.write('\r\n')

  await waitForSocketEvent(socket, 'data')

  expect(events.slice(3)).toEqual([
    ['resume'],
    [
      'data',
      Buffer.from(
        `HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\n\r\nhello world`
      ),
    ],
  ])
})

it('emits correct events for a mocked HTTP request', async () => {
  interceptor.on('request', ({ request }) => {
    request.respondWith(new Response('hello world'))
  })

  const connectionCallback = vi.fn()
  const socket = new net.Socket().connect(80, 'example.com', connectionCallback)
  const events = spyOnEvents(socket)

  await waitForSocketEvent(socket, 'connect')
  expect(events).toEqual([
    ['lookup', null, expect.any(String), 6, 'example.com'],
    ['connect'],
    ['ready'],
  ])

  socket.write('HEAD / HTTP/1.1\r\n')
  // Instruct the socket to close the connection
  // as soon as the response is received.
  socket.write('Connection: close\r\n')
  socket.write('Host: example.com\r\n')
  socket.write('\r\n')

  await waitForSocketEvent(socket, 'data')
  expect(events.slice(3)).toEqual([
    ['resume'],
    [
      'data',
      Buffer.from(
        `HTTP/1.1 200 OK\r\ncontent-type: text/plain;charset=UTF-8\r\n\r\nhello world`
      ),
    ],
  ])

  await waitForSocketEvent(socket, 'end')
  expect(events.slice(5)).toEqual([['readable'], ['end']])
})
