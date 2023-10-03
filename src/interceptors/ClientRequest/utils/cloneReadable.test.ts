import { it, expect } from 'vitest'
import { Readable } from 'stream'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { cloneReadable } from './cloneReadable'

it('allows consuming the source stream twice', async () => {
  const sourceEndPromise = new DeferredPromise<Buffer>()
  const cloneEndPromise = new DeferredPromise<Buffer>()

  const source = Readable.from(['hello', '', 'world'])
  const clone = cloneReadable(source)

  expect(source.readable).toBe(true)
  expect(clone.readable).toBe(true)

  const sourceChunks: Array<Buffer> = []
  source.on('data', (chunk) => sourceChunks.push(chunk))
  source.on('end', () => {
    sourceEndPromise.resolve(Buffer.concat(sourceChunks))
  })

  const cloneChunks: Array<Buffer> = []
  clone.on('data', (chunk) => cloneChunks.push(chunk))
  clone.on('end', () => {
    cloneEndPromise.resolve(Buffer.concat(cloneChunks))
  })

  const sourceBody = await sourceEndPromise
  expect(sourceBody.toString('utf8')).toBe('hello world')
  expect(source.readable).toBe(false)
  expect(source.readableEnded).toBe(true)

  const cloneBody = await cloneEndPromise
  expect(cloneBody.toString('utf8')).toBe('hello world')
  expect(clone.readable).toBe(false)
  expect(source.readableEnded).toBe(true)
})
