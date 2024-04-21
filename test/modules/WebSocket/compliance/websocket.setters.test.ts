/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForNextTick } from '../utils/waitForNextTick'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('sets the "onopen" event callback', async () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.onopen).toBeNull()

  const openCallback = vi.fn()
  ws.onopen = openCallback
  expect(ws.onopen).toEqual(openCallback)
  expect(openCallback).not.toHaveBeenCalled()

  await waitForNextTick()
  expect(openCallback).toHaveBeenCalledTimes(1)
})

it('removes previous "onopen" callback when setting the new one', async () => {
  const ws = new WebSocket('wss://example.com')
  const firstCallback = vi.fn()
  const secondCallback = vi.fn()
  ws.onopen = firstCallback
  ws.onopen = secondCallback

  expect(ws.onopen).toEqual(secondCallback)

  await waitForNextTick()
  expect(firstCallback).toHaveBeenCalledTimes(0)
  expect(secondCallback).toHaveBeenCalledTimes(1)
})

it('sets the "onmessage" event callback', async () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.onmessage).toBeNull()

  const messageCallback = vi.fn()
  ws.onmessage = messageCallback
  expect(ws.onmessage).toEqual(messageCallback)
  expect(messageCallback).not.toHaveBeenCalled()

  ws.dispatchEvent(new MessageEvent('message'))
  await waitForNextTick()

  expect(messageCallback).toHaveBeenCalledTimes(1)
})

it('removes previous "onmessage" callback when setting the new one', async () => {
  const ws = new WebSocket('wss://example.com')
  const firstCallback = vi.fn()
  const secondCallback = vi.fn()
  ws.onmessage = firstCallback
  ws.onmessage = secondCallback

  expect(ws.onmessage).toEqual(secondCallback)

  ws.dispatchEvent(new MessageEvent('message'))
  await waitForNextTick()

  expect(firstCallback).toHaveBeenCalledTimes(0)
  expect(secondCallback).toHaveBeenCalledTimes(1)
})

it('sets the "onclose" event callback', async () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.onclose).toBeNull()

  const closeCallback = vi.fn()
  ws.onclose = closeCallback
  expect(ws.onclose).toEqual(closeCallback)
  expect(closeCallback).not.toHaveBeenCalled()

  ws.close()
  await waitForNextTick()

  expect(closeCallback).toHaveBeenCalledTimes(1)
})

it('removes previous "onclose" callback when setting the new one', async () => {
  const ws = new WebSocket('wss://example.com')
  const firstCallback = vi.fn()
  const secondCallback = vi.fn()
  ws.onclose = firstCallback
  ws.onclose = secondCallback

  expect(ws.onclose).toEqual(secondCallback)

  ws.close()
  await waitForNextTick()

  expect(firstCallback).toHaveBeenCalledTimes(0)
  expect(secondCallback).toHaveBeenCalledTimes(1)
})

it('sets the "onerror" event callback', async () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.onerror).toBeNull()

  const errorCallback = vi.fn()
  ws.onerror = errorCallback
  expect(ws.onerror).toEqual(errorCallback)
  expect(errorCallback).not.toHaveBeenCalled()

  ws.dispatchEvent(new Event('error'))
  await waitForNextTick()

  expect(errorCallback).toHaveBeenCalledTimes(1)
})

it('removes previous "onerror" callback when setting the new one', async () => {
  const ws = new WebSocket('wss://example.com')
  const firstCallback = vi.fn()
  const secondCallback = vi.fn()
  ws.onerror = firstCallback
  ws.onerror = secondCallback

  expect(ws.onerror).toEqual(secondCallback)

  ws.dispatchEvent(new Event('error'))
  await waitForNextTick()

  expect(firstCallback).toHaveBeenCalledTimes(0)
  expect(secondCallback).toHaveBeenCalledTimes(1)
})
