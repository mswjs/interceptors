import { vi, it, expect } from 'vitest'
import { createProxy } from './createProxy'

it('does not interfere with default constructors', () => {
  const ProxyClass = createProxy(
    class {
      constructor(public name: string) {}
    },
    {}
  )

  const instance = new ProxyClass('John')
  expect(instance.name).toBe('John')
})

it('does not interfere with default getters', () => {
  const proxy = createProxy({ foo: 'initial' }, {})
  expect(proxy.foo).toBe('initial')
})

it('does not interfere with default setters', () => {
  const proxy = createProxy({ foo: 'initial' }, {})
  proxy.foo = 'next'

  expect(proxy.foo).toBe('next')
})

it('does not interfere with default methods', () => {
  const proxy = createProxy({ getValue: () => 'initial' }, {})
  expect(proxy.getValue()).toBe('initial')
})

it('spies on the constructor', () => {
  const constructorCall = vi.fn((args, next) => next())
  const ProxyClass = createProxy(
    class {
      constructor(public name: string, public age: number) {}
    },
    {
      constructorCall,
    }
  )

  new ProxyClass('John', 32)

  expect(constructorCall).toHaveBeenCalledTimes(1)
  expect(constructorCall).toHaveBeenCalledWith(
    ['John', 32],
    expect.any(Function)
  )
})

it('spies on property getters', () => {
  const getProperty = vi.fn((args, next) => next())
  const proxy = createProxy({ foo: 'initial' }, { getProperty })

  proxy.foo

  expect(getProperty).toHaveBeenCalledTimes(1)
  expect(getProperty).toHaveBeenCalledWith(['foo', proxy], expect.any(Function))
})

it('spies on property setters', () => {
  const setProperty = vi.fn((args, next) => next())
  const proxy = createProxy({ foo: 'initial' }, { setProperty })

  proxy.foo = 'next'

  expect(setProperty).toHaveBeenCalledTimes(1)
  expect(setProperty).toHaveBeenCalledWith(
    ['foo', 'next'],
    expect.any(Function)
  )
})

it('spies on method calls', () => {
  const methodCall = vi.fn((args, next) => next())
  const proxy = createProxy(
    {
      greet: (name: string) => `hello ${name}`,
    },
    { methodCall }
  )

  proxy.greet('Clair')

  expect(methodCall).toHaveBeenCalledTimes(1)
  expect(methodCall).toHaveBeenCalledWith(
    ['greet', ['Clair']],
    expect.any(Function)
  )
})
