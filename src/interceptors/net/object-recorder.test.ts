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

it('restores original target when disposed', () => {
  const target = { a: 1, b: 2 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  const proxiedObject = recorder.proxy
  expect(proxiedObject).not.toBe(target)

  recorder.proxy.a = 10
  expect(target.a).toBe(10)

  recorder.dispose()

  expect(recorder.proxy).toBe(target)
  expect(recorder.entries).toHaveLength(0)
})

it('restores nested proxies when disposed', () => {
  const target = { a: { b: { c: 1 } } }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  const proxiedA = recorder.proxy.a
  const proxiedB = recorder.proxy.a.b

  expect(proxiedA).not.toBe(target.a)
  expect(proxiedB).not.toBe(target.a.b)

  recorder.proxy.a.b.c = 10
  expect(target.a.b.c).toBe(10)

  recorder.dispose()

  expect(recorder.proxy).toBe(target)
  expect(recorder.proxy.a).toBe(target.a)
  expect(recorder.proxy.a.b).toBe(target.a.b)
})

it('allows mutations after dispose without recording', () => {
  const target = { a: 1 }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  recorder.proxy.a = 2
  expect(recorder.entries).toHaveLength(1)

  recorder.dispose()

  recorder.proxy.a = 3
  expect(target.a).toBe(3)
  expect(recorder.entries).toHaveLength(0)
})

it('restores nested arrays when disposed', () => {
  const target = { items: [1, 2, 3], nested: { arr: [4, 5] } }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  const proxiedItems = recorder.proxy.items
  const proxiedNestedArr = recorder.proxy.nested.arr

  expect(proxiedItems).not.toBe(target.items)
  expect(proxiedNestedArr).not.toBe(target.nested.arr)

  recorder.proxy.items.push(4)
  recorder.proxy.nested.arr.push(6)

  recorder.dispose()

  expect(recorder.proxy.items).toBe(target.items)
  expect(recorder.proxy.nested.arr).toBe(target.nested.arr)
  expect(target.items).toEqual([1, 2, 3, 4])
  expect(target.nested.arr).toEqual([4, 5, 6])
})

it('restores deeply nested object proxies when disposed', () => {
  const target = {
    level1: {
      level2: {
        level3: {
          value: 'deep',
        },
      },
    },
  }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  const proxiedLevel1 = recorder.proxy.level1
  const proxiedLevel2 = recorder.proxy.level1.level2
  const proxiedLevel3 = recorder.proxy.level1.level2.level3

  expect(proxiedLevel1).not.toBe(target.level1)
  expect(proxiedLevel2).not.toBe(target.level1.level2)
  expect(proxiedLevel3).not.toBe(target.level1.level2.level3)

  recorder.dispose()

  expect(recorder.proxy.level1).toBe(target.level1)
  expect(recorder.proxy.level1.level2).toBe(target.level1.level2)
  expect(recorder.proxy.level1.level2.level3).toBe(target.level1.level2.level3)
})

it('handles dispose with mixed property types', () => {
  const target = {
    primitive: 42,
    object: { nested: true },
    array: [1, 2, 3],
    func() {
      return 'result'
    },
  }
  const recorder = new ObjectRecorder(target)
  recorder.start()

  const proxiedObject = recorder.proxy.object
  const proxiedArray = recorder.proxy.array

  expect(proxiedObject).not.toBe(target.object)
  expect(proxiedArray).not.toBe(target.array)

  recorder.dispose()

  expect(recorder.proxy).toBe(target)
  expect(recorder.proxy.object).toBe(target.object)
  expect(recorder.proxy.array).toBe(target.array)
  expect(recorder.proxy.func()).toBe('result')
})
