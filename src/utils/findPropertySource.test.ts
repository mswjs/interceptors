import { describe, it, expect } from 'vitest'
import { findPropertySource } from './findPropertySource'

describe('findPropertySource', () => {
  it('does return the source for objects without prototypes', () => {
    const obj = Object.create(null)
    obj.test = undefined
    const source = findPropertySource(obj, 'test')
    expect(source).toBe(obj)
  })

  it('does return the source for objects with prototypes', () => {
    const prototype = Object.create(null)
    prototype.test = undefined

    const obj = Object.create(prototype)

    const source = findPropertySource(obj, 'test')
    expect(source).toBe(prototype)
  })

  it('does return null if the prototype chain does not contain the property', () => {
    const prototype = Object.create(null)
    const obj = Object.create(prototype)

    const source = findPropertySource(obj, 'test')
    expect(source).toBeNull()
  })
})
