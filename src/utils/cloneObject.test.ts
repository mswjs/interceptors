import { cloneObject } from './cloneObject'

test('clones the given Object', () => {
  const original = { a: { b: 1 }, c: { d: { e: 2 } } }
  const clone = cloneObject(original)

  expect(clone).toEqual(original)
  clone.a.b = 10
  clone.c.d.e = 20

  expect(clone).toHaveProperty(['a', 'b'], 10)
  expect(clone).toHaveProperty(['c', 'd', 'e'], 20)
  expect(original).toHaveProperty(['a', 'b'], 1)
  expect(original).toHaveProperty(['c', 'd', 'e'], 2)
})
