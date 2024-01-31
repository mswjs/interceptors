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

it('emits "open" event when the connection is opened', async () => {
  const openEventPromise = new DeferredPromise<Event>()

  const ws = new WebSocket('wss://example.com')
  ws.onopen = openEventPromise.resolve

  const openEvent = await openEventPromise
  expect(openEvent.type).toBe('open')
  expect(openEvent.target).toBe(ws)
})

it('emits "message" event on the incoming event from the server', async () => {
  interceptor.once('connection', ({ client }) => {
    client.send('hello')
  })

  const messageEventPromise = new DeferredPromise<MessageEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = messageEventPromise.resolve

  const messageEvent = await messageEventPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello')
  expect(messageEvent.target).toBe(ws)
  expect(messageEvent.origin).toBe(ws.url)
})

it('emits "close" event when the connection is closed', async () => {
  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onclose = closeEventPromise.resolve
  ws.close()

  expect(await closeEventPromise).toMatchObject({
    type: 'close',
    target: ws,
  })
})

it('emits "close" event when the connection is closed normally by the server', async () => {
  interceptor.once('connection', ({ client }) => {
    client.close()
  })

  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onclose = closeEventPromise.resolve

  const closeEvent = await closeEventPromise
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.target).toBe(ws)
})

it('emits "close" event when the connection is closed by the server with a code and a reason', async () => {
  interceptor.once('connection', ({ client }) => {
    client.close(3000, 'Oops!')
  })

  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onclose = closeEventPromise.resolve

  const closeEvent = await closeEventPromise
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(3000)
  expect(closeEvent.reason).toBe('Oops!')
  expect(closeEvent.target).toBe(ws)
})

it('emits "error" event when the connection is closed due to an error', async () => {
  interceptor.once('connection', ({ client }) => {
    // Mock a connection close due to receiving the data
    // the server cannot accept.
    client.close(1003)
  })

  const errorEventPromise = new DeferredPromise<Event>()
  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onerror = errorEventPromise.resolve
  ws.onclose = closeEventPromise.resolve

  const errorEvent = await errorEventPromise
  expect(errorEvent.type).toBe('error')
  expect(errorEvent.target).toBe(ws)

  const closeEvent = await closeEventPromise
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1003)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(false)
  expect(closeEvent.target).toBe(ws)
})
