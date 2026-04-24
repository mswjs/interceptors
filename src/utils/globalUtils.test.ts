import { it, beforeEach, afterEach, expect, vi } from 'vitest'
import { globalsRegistry } from './globalsRegistry'

declare global {
  var foo: { original: boolean }
}

const realGlobalPrototype = Object.getPrototypeOf(global)

beforeEach(() => {
  global.foo = { original: true }
})

afterEach(() => {
  Object.setPrototypeOf(global, realGlobalPrototype)
  globalsRegistry.restoreAllGlobals()
})

it('replaces the global', () => {
  globalsRegistry.replaceGlobal('foo', { original: false })
  expect(global.foo).toEqual({ original: false })
})

it('replaces the global set on the prototype', () => {
  function FakeGlobalScope() {}
  FakeGlobalScope.prototype.foo = { prototype: true }
  Object.setPrototypeOf(global, FakeGlobalScope.prototype)
  Reflect.deleteProperty(global, 'foo')

  expect(global.foo).toEqual({ prototype: true })
  expect(FakeGlobalScope.prototype.foo).toEqual({ prototype: true })

  globalsRegistry.replaceGlobal('foo', { original: false })

  expect(global.foo).toEqual({ original: false })
  expect(FakeGlobalScope.prototype.foo, 'Preserves prototype value').toEqual({
    prototype: true,
  })
})

it('replaces the global after it was restored', () => {
  const restoreGlobal = globalsRegistry.replaceGlobal('foo', {
    original: false,
  })
  expect(global.foo).toEqual({ original: false })

  restoreGlobal()
  expect(global.foo).toEqual({ original: true })

  globalsRegistry.replaceGlobal('foo', { original: false })
  expect(global.foo).toEqual({ original: false })
})

it('warns on replacing a non-existing global', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  globalsRegistry.replaceGlobal(
    // @ts-expect-error Intentionally invalid value.
    'NON-EXISTING',
    { original: false }
  )
  expect(console.warn).toHaveBeenCalledExactlyOnceWith(
    'Failed to replace a global value at "NON-EXISTING": not a global value.'
  )
})

it('throws if replacing an already replaced global', () => {
  globalsRegistry.replaceGlobal('foo', { original: false })
  expect(global.foo).toEqual({ original: false })

  expect(() =>
    globalsRegistry.replaceGlobal('foo', { original: false })
  ).toThrow('Failed to replace a global value at "foo": already replaced.')
})

it('does nothing if restoring an already restored global', () => {
  const restoreGlobal = globalsRegistry.replaceGlobal('foo', {
    original: false,
  })

  expect(global.foo).toEqual({ original: false })

  restoreGlobal()
  expect(global.foo).toEqual({ original: true })

  restoreGlobal()
  expect(global.foo).toEqual({ original: true })
})

it('restores the global', () => {
  const restoreGlobal = globalsRegistry.replaceGlobal('foo', {
    original: false,
  })
  expect(global.foo).toEqual({ original: false })

  restoreGlobal()
  expect(global.foo).toEqual({ original: true })
})

it('restores the global set on the prototype', () => {
  function FakeGlobalScope() {}
  FakeGlobalScope.prototype.foo = { prototype: true }
  Object.setPrototypeOf(global, FakeGlobalScope.prototype)
  Reflect.deleteProperty(global, 'foo')

  expect(global.foo).toEqual({ prototype: true })

  const restoreGlobal = globalsRegistry.replaceGlobal('foo', {
    original: false,
  })

  expect(global.foo).toEqual({ original: false })

  restoreGlobal()
  expect(global.foo).toEqual({ prototype: true })
})

it('restores global to the original property descriptor', () => {
  const descriptor: PropertyDescriptor = {
    value: { original: true },
    enumerable: false,
    configurable: true,
    writable: false,
  }
  Object.defineProperty(global, 'foo', descriptor)
  expect(Object.getOwnPropertyDescriptor(global, 'foo')).toEqual(descriptor)

  const restoreGlobal = globalsRegistry.replaceGlobal('foo', {
    original: false,
  })

  expect(global.foo).toEqual({ original: false })
  expect(Object.getOwnPropertyDescriptor(global, 'foo')).toEqual({
    value: { original: false },
    enumerable: true,
    configurable: true,
    writable: false,
  })

  restoreGlobal()

  expect(global.foo).toEqual({ original: true })
  expect(Object.getOwnPropertyDescriptor(global, 'foo')).toEqual(descriptor)
})
