import { it, expect } from 'vitest'
import { Socket } from 'net'
import http from 'http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { drainIncomingMessage } from './drainIncomingMessage'

it('drains the given IncomingMessage', async () => {
  const readableEndPromise = new DeferredPromise<void>()
  const messageEndPromise = new DeferredPromise<void>()
  const message = new http.IncomingMessage(new Socket())

  message.on('end', () => messageEndPromise.resolve())
  message.on('error', (error) => readableEndPromise.reject(error))

  const readable = drainIncomingMessage(message)
  const chunks: Array<Buffer> = []

  readable.on('data', (chunk) => chunks.push(chunk))
  readable.on('end', () => readableEndPromise.resolve())
  readable.on('error', (error) => readableEndPromise.reject(error))

  message.push('hello')
  message.push(' ')
  message.push('world')
  message.push(null)

  await readableEndPromise
  await messageEndPromise

  const data = Buffer.concat(chunks).toString('utf-8')
  expect(data).toBe('hello world')
})

it('forwards source stream errors to the passthrough stream', async () => {
  const readableErrorPromise = new DeferredPromise<Error>()
  const message = new http.IncomingMessage(new Socket())
  const readable = drainIncomingMessage(message)
  readable.on('error', (error) => readableErrorPromise.resolve(error))

  message.emit('error', new TypeError('Oops!'))

  const error = await readableErrorPromise
  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toBe('Oops!')
})

it('keeps source readable after draining', async () => {
  const readableEndPromise = new DeferredPromise<void>()
  const message = new http.IncomingMessage(new Socket())
  const readable = drainIncomingMessage(message)

  message.push('chunk')
  message.push(null)

  readable.on('data', () => {})
  readable.on('end', () => readableEndPromise.resolve())

  await readableEndPromise

  expect(message.readable).toBe(true)
  expect(readable.readable).toBe(true)
})
