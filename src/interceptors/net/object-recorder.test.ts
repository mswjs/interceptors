import { it, expect } from 'vitest'
import { ObjectRecorder } from './object-recorder'

it('records a setter', () => {
  const target = { a: 1 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.a = 2

  expect(target).toEqual({ a: 2 })
  expect(recorder.entries).toEqual([
    {
      type: 'set',
      path: [],
      metadata: { property: 'a', descriptor: { value: 2 } },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: 1 }
  recorder.replay(otherTarget)
  expect(otherTarget.a).toBe(2)
})

it('records a nested setter', () => {
  const target = { a: { b: 1 } }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.a.b = 2

  expect(target).toEqual({ a: { b: 2 } })
  expect(recorder.entries).toEqual([
    {
      type: 'set',
      path: ['a'],
      metadata: { property: 'b', descriptor: { value: 2 } },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: { b: 1 } }
  recorder.replay(otherTarget)
  expect(otherTarget.a.b).toBe(2)
})

it('records a method call without any arguments', () => {
  const target = {
    state: '',
    update() {
      this.state = 'updated'
    },
  }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.update()

  expect(target.state).toBe('updated')
  expect(recorder.entries).toEqual([
    {
      type: 'apply',
      path: [],
      metadata: { method: 'update', args: [] },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = {
    state: '',
    update() {
      this.state = 'updated'
    },
  }
  recorder.replay(otherTarget)
  expect(otherTarget.state).toBe('updated')
})

it('records array mutations', () => {
  const target = { numbers: [1] }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.numbers.push(2)

  expect(target).toEqual({ numbers: [1, 2] })
  expect(recorder.entries).toEqual([
    {
      type: 'apply',
      path: ['numbers'],
      metadata: {
        method: 'push',
        args: [2],
      },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { numbers: [1] }
  recorder.replay(otherTarget)
  expect(otherTarget.numbers).toEqual([1, 2])
})

it('records a method call that deletes a property', () => {
  const target: { a?: number; clear: () => void } = {
    a: 1,
    clear() {
      delete this.a
    },
  }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.clear()

  expect(target).toEqual({ clear: expect.any(Function) })
  expect(recorder.entries).toEqual([
    {
      type: 'apply',
      path: [],
      metadata: {
        method: 'clear',
        args: [],
      },
      replay: expect.any(Function),
    },
  ])

  const otherTarget: { a?: number; clear: () => void } = {
    a: 1,
    clear() {
      delete this.a
    },
  }
  recorder.replay(otherTarget)
  expect(otherTarget).toEqual({ clear: expect.any(Function) })
})

it('records a method call with arguments', () => {
  const target = {
    state: '',
    update(value: string) {
      this.state = value
    },
  }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.update('new state')

  expect(target.state).toBe('new state')
  expect(recorder.entries).toEqual([
    {
      type: 'apply',
      path: [],
      metadata: { method: 'update', args: ['new state'] },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = {
    state: '',
    update(value: string) {
      this.state = value
    },
  }
  recorder.replay(otherTarget)
  expect(otherTarget.state).toBe('new state')
})

it('records a property deletion', () => {
  const target: { a?: number; b: number } = { a: 1, b: 2 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  delete recorder.proxy.a

  expect(target).toEqual({ b: 2 })
  expect(recorder.entries).toEqual([
    {
      type: 'delete',
      path: [],
      metadata: { property: 'a' },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: 1, b: 2 }
  recorder.replay(otherTarget)
  expect(otherTarget).toEqual({ b: 2 })
})

it('records a nested property deletion', () => {
  const target: { a: { b?: number }; c: number } = { a: { b: 1 }, c: 2 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  delete recorder.proxy.a.b

  expect(target).toEqual({ a: {}, c: 2 })
  expect(recorder.entries).toEqual([
    {
      type: 'delete',
      path: ['a'],
      metadata: { property: 'b' },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: { b: 1 }, c: 2 }
  recorder.replay(otherTarget)
  expect(otherTarget).toEqual({ a: {}, c: 2 })
})

it('supports running actions quietly', () => {
  const target = { a: 1, b: 2 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.a = 2
  recorder.runQuietly(() => {
    recorder.proxy.b = 3
  })

  expect(target).toEqual({ a: 2, b: 3 })
  expect(recorder.entries).toEqual([
    {
      type: 'set',
      path: [],
      metadata: {
        property: 'a',
        descriptor: {
          value: 2,
        },
      },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: 1, b: 2 }
  recorder.replay(otherTarget)
  expect(otherTarget, 'Does not replay quiet actions').toEqual({
    a: 2,
    b: 2,
  })
})

it('supports custom action predicate', () => {
  const target = { a: 1, _internal: 'a' }
  const recorder = new ObjectRecorder(target, {
    filter(entry) {
      if (
        entry.type === 'set' &&
        entry.metadata.property.toString().startsWith('_')
      ) {
        return false
      }

      return true
    },
  })
  recorder.start()

  recorder.proxy.a = 2
  recorder.proxy._internal = 'b'

  expect(target).toEqual({ a: 2, _internal: 'b' })
  expect(recorder.entries).toEqual([
    {
      type: 'set',
      path: [],
      metadata: {
        property: 'a',
        descriptor: {
          value: 2,
        },
      },
      replay: expect.any(Function),
    },
  ])

  const otherTarget = { a: 1, _internal: 'a' }
  recorder.replay(otherTarget)
  expect(otherTarget, 'Does not replay ignored actions').toEqual({
    a: 2,
    _internal: 'a',
  })
})
