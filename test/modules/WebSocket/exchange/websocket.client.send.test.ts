/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('receives incoming mock text data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  interceptor.once('connection', ({ client }) => {
    client.send('hello from server')
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello from server')
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})

it('receives incoming mock Blob data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  interceptor.once('connection', ({ client }) => {
    client.send(new Blob(['blob from server']))
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toEqual(new Blob(['blob from server']))
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})

it('receives incoming mock ArrayBuffer data from the server', async () => {
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  const buffer = new TextEncoder().encode('hello')

  interceptor.once('connection', ({ client }) => {
    client.send(buffer)
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toEqual(buffer)
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})

it('receives mock data in response to sent event', async () => {
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      if (event.data === 'John') {
        client.send(`Hello, ${event.data}!`)
      }
    })
  })

  const ws = new WebSocket('wss://example.com')
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })
  ws.addEventListener('open', () => {
    ws.send('Sarah')
    ws.send('John')
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('Hello, John!')
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})
