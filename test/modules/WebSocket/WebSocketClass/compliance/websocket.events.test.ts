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

it('emits "close" event when the connection is closed by the server', async () => {
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
    client.close(new Error('Oops!'))
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

it('emits "message" event on the incoming event from the server', async () => {
  interceptor.once('connection', ({ client }) => {
    client.send('hello')
  })

  const messageEventPromise = new DeferredPromise<MessageEvent>()

  const ws = new WebSocket('wss://example.com')
  ws.onmessage = messageEventPromise.resolve

  expect(await messageEventPromise).toMatchObject({
    data: 'hello',
    target: ws,
  })
})
