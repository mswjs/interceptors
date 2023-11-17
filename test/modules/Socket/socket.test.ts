import { afterAll, beforeAll, it, expect, vi } from 'vitest'
import net from 'node:net'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { SocketInterceptor } from '../../../src/interceptors/Socket'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports raw net.Socket usage', async () => {
  interceptor.once('socket', (event) => {
    event.push('hello from server')
    event.push(null)
  })

  const socket = new net.Socket()
  socket.on('lookup', (error, address, family, host) => {
    console.log('lookup', { error, address, family, host })
  })

  socket.write('data from client')
  socket.end()

  socket.on('data', (chunk) => {
    console.log('client sent data:', chunk.toString('utf-8'))
  })

  const endPromise = new DeferredPromise<void>()
  socket.on('end', () => endPromise.resolve())

  await endPromise
})

it('supports net.createConnection()', async () => {
  interceptor.once('socket', (event) => {
    // Explicitly allow the connection.
    // When called without any arguments, will connect to
    // the same host/port specified in "net.createConnect()".
    // Can also provide overrides for host/port to emulate
    // the connection elsewhere.
    event.connect()

    event.on('data', (chunk) => {
      event.push(`Hello, ${chunk}`)
      event.push(null)
    })
  })

  const socket = net.createConnection({
    host: 'non-existing-host.com',
    port: 80,
    path: '/',
  })

  const lookupListener = vi.fn()
  socket.on('lookup', lookupListener)

  const connectListener = vi.fn()
  socket.on('connect', connectListener)

  socket.write('John')
  socket.end()

  socket.on('data', (chunk) =>
    console.log('from server:', chunk.toString('utf8'))
  )

  const endPromise = new DeferredPromise<void>()
  socket.on('end', () => endPromise.resolve())
  await endPromise

  expect(lookupListener).toHaveBeenCalledWith(
    null,
    '127.0.0.1',
    4,
    'non-existing-host.com'
  )
  expect(connectListener).toHaveBeenCalledTimes(1)
})

it.only('http.get', async () => {
  interceptor.once('socket', (event) => {
    console.log('--> INTERCEPTED SOCKET!')
    event.connect()

    event.on('data', (chunk) => console.log('request sent:', chunk))

    event.push(Buffer.from('HTTP/1.1 200 OK\r\n' + 'Connection: close\r\n'))
    event.push(null)
  })

  const request = http.get('http://example.com/resource')

  await new Promise<void>((resolve) => {
    request.on('socket', (socket) => {
      console.log('req socket!')

      socket.on('connect', () => console.log('socket connect!'))
      socket.on('lookup', (...args) => console.log('socket lookup', args))
      socket.on('ready', () => console.log('--> socket READY!'))
      socket.on('error', (error) => console.log('socket error', error))
      socket.on('timeout', () => console.log('socket timeout!'))

      socket.on('ready', () => resolve())
      socket.on('data', (data) =>
        console.log('socket data:', data.toString('utf8'))
      )
    })
  })

  const responsePromise = new DeferredPromise<http.IncomingMessage>()
  request.on('response', (response) => {
    console.log('--> RESPONSE!')
    responsePromise.resolve(response)
  })

  const response = await responsePromise
  // expect(response.statusCode).toBe(200)
})
