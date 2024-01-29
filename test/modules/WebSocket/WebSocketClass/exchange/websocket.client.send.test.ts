/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('receives incoming mock text data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<string>()
  interceptor.once('connection', ({ client }) => {
    client.send('hello from server')
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })

  expect(await messageReceivedPromise).toBe('hello from server')
})

it('receives incoming mock Blob data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<Blob>()
  interceptor.once('connection', ({ client }) => {
    client.send(new Blob(['blob from server']))
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })

  expect(await messageReceivedPromise).toEqual(new Blob(['blob from server']))
})

it('receives incoming mock ArrayBuffer data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<Uint8Array>()
  const buffer = new TextEncoder().encode('hello')

  interceptor.once('connection', ({ client }) => {
    client.send(buffer)
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })

  expect(await messageReceivedPromise).toEqual(buffer)
})

it('receives mock data in response to sent event', async () => {
  interceptor.once('connection', ({ client }) => {
    client.on('message', (event) => {
      if (event.data === 'John') {
        client.send(`Hello, ${event.data}!`)
      }
    })
  })

  const ws = new WebSocket('wss://example.com')
  const messageReceivedPromise = new DeferredPromise<string>()
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })
  ws.addEventListener('open', () => {
    ws.send('Sarah')
    ws.send('John')
  })

  expect(await messageReceivedPromise).toBe('Hello, John!')
})
