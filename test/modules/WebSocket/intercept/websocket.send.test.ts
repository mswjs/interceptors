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

it('errors when sending data before open', async () => {
  const ws = new WebSocket('ws://example.com')
  expect(() => ws.send('no-op')).toThrow('InvalidStateError')
})

it('intercepts text sent over websocket', async () => {
  const messageReceivedPromise = new DeferredPromise<string>()

  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      messageReceivedPromise.resolve(event.data)
    })
  })

  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => ws.send('hello'))

  expect(await messageReceivedPromise).toBe('hello')
})

it('intercepts Blob sent over websocket', async () => {
  const messageReceivedPromise = new DeferredPromise<Blob>()

  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      messageReceivedPromise.resolve(event.data)
    })
  })

  const blob = new Blob(['hello from client'])
  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => ws.send(blob))

  expect(await messageReceivedPromise).toBe(blob)
})

it('intercepts ArrayBuffer sent over websocket', async () => {
  const messageReceivedPromise = new DeferredPromise<ArrayBuffer>()

  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      messageReceivedPromise.resolve(event.data)
    })
  })

  const buffer = new TextEncoder().encode('hello')
  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => ws.send(buffer))

  expect(await messageReceivedPromise).toEqual(buffer)
})

it('increases "bufferAmmount" before data is sent', async () => {
  const bufferAmountPromise = new DeferredPromise<{
    beforeSend: number
    afterSend: number
  }>()

  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => {
    ws.send('hello')
    const beforeSend = ws.bufferedAmount
    queueMicrotask(() => {
      bufferAmountPromise.resolve({
        beforeSend,
        afterSend: ws.bufferedAmount,
      })
    })
  })

  expect(await bufferAmountPromise).toEqual({
    beforeSend: 5,
    afterSend: 0,
  })
})
