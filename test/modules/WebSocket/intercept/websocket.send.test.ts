// @vitest-environment node-with-websocket
import { it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('errors when sending data before open', async () => {
  interceptor.once('connection', () => {})
  const ws = new WebSocket('ws://example.com')
  expect(() => ws.send('no-op')).toThrow('InvalidStateError')
})

it('intercepts text sent over websocket', async () => {
  const messageReceivedPromise = new DeferredPromise<string>()

  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        messageReceivedPromise.resolve(event.data)
      } else {
        messageReceivedPromise.reject(new Error('Expected string data'))
      }
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
      if (event.data instanceof Blob) {
        messageReceivedPromise.resolve(event.data)
      } else {
        messageReceivedPromise.reject(new Error('Expected Blob data'))
      }
    })
  })

  const blob = new Blob(['hello from client'])
  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => ws.send(blob))

  expect(await messageReceivedPromise).toBe(blob)
})

it('intercepts ArrayBuffer sent over websocket', async () => {
  const messageReceivedPromise = new DeferredPromise<Uint8Array>()

  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      /**
       * @note ArrayBuffer data is represented as Buffer in Node.js.
       */
      if (event.data instanceof Uint8Array) {
        messageReceivedPromise.resolve(event.data)
      } else {
        messageReceivedPromise.reject(new Error('Expected ArrayBuffer data'))
      }
    })
  })

  const buffer = new TextEncoder().encode('hello')
  const ws = new WebSocket('ws://example.com')
  ws.addEventListener('open', () => ws.send(buffer))

  expect(await messageReceivedPromise).toEqual(buffer)
})

it('increases "bufferAmount" before data is sent', async () => {
  interceptor.once('connection', () => {})

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
