import { it, expect } from 'vitest'
import { normalizeClientRequestEndArgs } from './normalizeClientRequestEndArgs'

it('returns [null, null, cb] given only the callback', () => {
  const callback = () => {}
  expect(normalizeClientRequestEndArgs(callback)).toEqual([
    null,
    null,
    callback,
  ])
})

it('returns [chunk, null, null] given only the chunk', () => {
  expect(normalizeClientRequestEndArgs('chunk')).toEqual(['chunk', null, null])
})

it('returns [chunk, cb] given the chunk and the callback', () => {
  const callback = () => {}
  expect(normalizeClientRequestEndArgs('chunk', callback)).toEqual([
    'chunk',
    null,
    callback,
  ])
})

it('returns [chunk, encoding] given the chunk with the encoding', () => {
  expect(normalizeClientRequestEndArgs('chunk', 'utf8')).toEqual([
    'chunk',
    'utf8',
    null,
  ])
})

it('returns [chunk, encoding, cb] given all three arguments', () => {
  const callback = () => {}
  expect(normalizeClientRequestEndArgs('chunk', 'utf8', callback)).toEqual([
    'chunk',
    'utf8',
    callback,
  ])
})
