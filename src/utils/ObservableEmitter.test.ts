import { ObservableEmitter } from './ObservableEmitter'
import { sleep } from './sleep'

describe('on', () => {
  it('appends a listener for the event', () => {
    const emitter = new ObservableEmitter<{ greet(name: string): void }>()
    const listener = jest.fn()
    emitter.on('greet', listener)

    emitter.emit('greet', 'John')

    expect(listener).toHaveBeenCalledWith('John')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('executes listeners in the order they were added', () => {
    const emitter = new ObservableEmitter<{ greet(name: string): void }>()
    const firstListener = jest.fn()
    const secondListener = jest.fn()
    emitter.on('greet', firstListener)
    emitter.on('greet', secondListener)

    emitter.emit('greet', 'John')

    expect(firstListener).toHaveBeenCalledWith('John')
    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledWith('John')
    expect(secondListener).toHaveBeenCalledTimes(1)
  })
})

describe('once', () => {
  it('calls the listener only once', () => {
    const emitter = new ObservableEmitter<{ greet(name: string): void }>()
    const listener = jest.fn()
    emitter.once('greet', listener)

    emitter.emit('greet', 'John')
    emitter.emit('greet', 'John')

    expect(listener).toHaveBeenCalledWith('John')
    expect(listener).toHaveBeenCalledTimes(1)

    // Must clear all the listeners once the event is handled.
    expect(emitter['events'].get('greet')?.listeners.size).toBe(0)
  })
})

describe('removeListener', () => {
  it('removes a single listener', () => {
    const emitter = new ObservableEmitter<{ greet(name: string): void }>()
    const listener = jest.fn()
    emitter.on('greet', listener)
    emitter.removeListener('greet', listener)

    emitter.emit('greet', 'John')

    expect(listener).not.toHaveBeenCalled()
  })

  it('removes multiple listeners', () => {
    const emitter = new ObservableEmitter<{ greet(name: string): void }>()
    const firstListener = jest.fn()
    emitter.on('greet', firstListener)
    const secondListener = jest.fn()
    emitter.on('greet', secondListener)
    emitter.removeListener('greet', firstListener)
    emitter.removeListener('greet', secondListener)

    emitter.emit('greet', 'John')

    expect(firstListener).not.toHaveBeenCalled()
    expect(secondListener).not.toHaveBeenCalled()
  })
})

describe('removeAllListeners', () => {
  it('removes all listeners for the given event', () => {
    const emitter = new ObservableEmitter<{ greet(): void; bye(): void }>()
    const greetListener = jest.fn()
    emitter.on('greet', greetListener)
    const byeListener = jest.fn()
    emitter.on('bye', byeListener)

    emitter.removeAllListeners('greet')

    emitter.emit('greet')
    expect(greetListener).not.toHaveBeenCalled()

    emitter.emit('bye')
    expect(byeListener).toHaveBeenCalledTimes(1)
  })

  it('removes all listeners if no event was provided', () => {
    const emitter = new ObservableEmitter<{ greet(): void; bye(): void }>()
    const greetListener = jest.fn()
    emitter.on('greet', greetListener)
    const byeListener = jest.fn()
    emitter.on('bye', byeListener)

    emitter.removeAllListeners()

    emitter.emit('greet')
    expect(greetListener).not.toHaveBeenCalled()

    emitter.emit('bye')
    expect(byeListener).not.toHaveBeenCalled()
  })
})

describe('untilIdle', () => {
  it('resolves immediately if there are no pending events', async () => {
    const emitter = new ObservableEmitter<{ ping(): void }>()
    const promise = emitter.untilIdle('ping')
    expect(await promise).toBeUndefined()
  })

  it('resolves once all the listeners have been called', async () => {
    const emitter = new ObservableEmitter<{ greet(): void }>()
    const listener = jest.fn()
    emitter.on('greet', async () => {
      await sleep(150)
      listener()
    })

    emitter.emit('greet')
    expect(listener).not.toHaveBeenCalled()

    await emitter.untilIdle('greet')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(emitter['events'].get('greet')?.queue).toEqual(new Set())
  })

  it('rejects if one of the listeners throws', async () => {
    const emitter = new ObservableEmitter<{ greet(): void }>()
    const listener = jest.fn()
    emitter.on('greet', async () => {
      await sleep(150)
      listener()
      throw new Error('oops')
    })

    emitter.emit('greet')
    expect(listener).not.toHaveBeenCalled()

    // Rejection reason must propagate to the parent scope.
    await expect(emitter.untilIdle('greet')).rejects.toThrow('oops')

    expect(listener).toHaveBeenCalledTimes(1)

    // The queue must be cleaned nonetheless.
    expect(emitter['events'].get('greet')?.queue).toEqual(new Set())
  })
})
