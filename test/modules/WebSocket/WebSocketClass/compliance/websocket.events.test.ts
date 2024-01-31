/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'
import { DeferredPromise } from '@open-draft/deferred-promise'

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

  expect(await openEventPromise).toMatchObject({
    type: 'open',
    target: ws,
  })
})

it('emits "message" event on the incoming event from the server', async () => {
  interceptor.once('connection', ({ client }) => {
    client.send('hello')
  })

  const messageEventPromise = new DeferredPromise<MessageEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = messageEventPromise.resolve

  expect(await messageEventPromise).toMatchObject({
    type: 'message',
    data: 'hello',
    target: ws,
  })
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

  expect(await closeEventPromise).toMatchObject({
    type: 'close',
    target: ws,
  })
})

it('emits "close" event when the connection is closed by the server with a code and a reason', async () => {
  interceptor.once('connection', ({ client }) => {
    client.close(3000, 'Oops!')
  })

  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onclose = closeEventPromise.resolve

  expect(await closeEventPromise).toMatchObject({
    type: 'close',
    target: ws,
    code: 3000,
    reason: 'Oops!',
  })
})

it('emits "error" event when the connection is closed due to an error', async () => {
  interceptor.once('connection', ({ client }) => {
    // Mock a connection close due to receiving the data
    // the server cannot accept.
    client.close(1003)
  })

  const errorEventPromise = new DeferredPromise<Event>()
  const closeEventPromise = new DeferredPromise<Event>()

  const ws = new WebSocket('wss://example.com')
  ws.onerror = errorEventPromise.resolve
  ws.onclose = closeEventPromise.resolve

  expect(await errorEventPromise).toMatchObject({
    type: 'error',
    target: ws,
  })
  expect(await closeEventPromise).toMatchObject({
    type: 'close',
    code: 1003,
    reason: '',
    wasClean: false,
    target: ws,
  })
})