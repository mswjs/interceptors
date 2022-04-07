/**
 * @jest-environment jsdom
 */
import { getDataLength } from './getDataLength'

it('returns the length of a string', () => {
  expect(getDataLength('hello world')).toBe(11)
})

it('returns the size of a Blob', () => {
  expect(getDataLength(new Blob(['wake', 'up']))).toBe(6)
})

it('returns the byte length of an ArrayBuffer', () => {
  expect(getDataLength(new ArrayBuffer(9))).toBe(9)
})
