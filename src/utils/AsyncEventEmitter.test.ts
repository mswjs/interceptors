import { AsyncEventEmitter } from './AsyncEventEmitter'
import { sleep } from '../../test/helpers'

it('emits and listens to events', () => {
  const emitter = new AsyncEventEmitter<{ hello(name: string): void }>()
  const listener = jest.fn()
  emitter.on('hello', listener)
  emitter.emit('hello', 'John')

  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith('John')
})

it('resolves "untilIdle" when all the event listeners are done', async () => {
  const emitter = new AsyncEventEmitter<{ speak(word: string): void }>()

  const results: string[] = []
  const firstListener = jest.fn(() => results.push('first'))
  emitter.on('speak', firstListener)

  const secondListener = jest.fn(async () => {
    await sleep(150)
    results.push('second')
  })
  emitter.on('speak', secondListener)

  emitter.emit('speak', 'hi')
  await emitter.untilIdle('speak')

  // All listeners must be called.
  expect(firstListener).toHaveBeenCalledTimes(1)
  expect(secondListener).toHaveBeenCalledTimes(1)

  // All promise listeners must be awaited.
  expect(results).toEqual(['first', 'second'])
})

it('resolves "untilIdle" immediately if there are no pending listeners', async () => {
  const emitter = new AsyncEventEmitter<{ ping(): void }>()
  emitter.emit('ping')

  await expect(emitter.untilIdle('ping')).resolves.toBeUndefined()
})

it('propagates listener exceptions to "untilIdle" promise', async () => {
  const emitter = new AsyncEventEmitter<{ ping(): void }>()

  const error = new Error('oops')
  const listener = jest.fn(() => {
    throw error
  })
  emitter.on('ping', listener)

  emitter.emit('ping')
  await expect(emitter.untilIdle('ping')).rejects.toBe(error)
})

it('does not emit events once the emitter was deactivated', () => {
  const emitter = new AsyncEventEmitter<{ ping(): void }>()

  const listener = jest.fn()
  emitter.on('ping', listener)
  emitter.deactivate()

  emitter.emit('ping')

  expect(listener).not.toHaveBeenCalled()
})
