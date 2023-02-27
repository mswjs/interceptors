import { it, expect } from 'vitest'
import { normalizeClientRequestWriteArgs } from './normalizeClientRequestWriteArgs'

it('returns a triplet of null given no chunk, encoding, or callback', () => {
  expect(
    normalizeClientRequestWriteArgs([
      // @ts-ignore
      undefined,
      undefined,
      undefined,
    ])
  ).toEqual([undefined, undefined, undefined])
})

it('returns [chunk, null, null] given only a chunk', () => {
  expect(normalizeClientRequestWriteArgs(['chunk', undefined])).toEqual([
    'chunk',
    undefined,
    undefined,
  ])
})

it('returns [chunk, encoding] given only chunk and encoding', () => {
  expect(normalizeClientRequestWriteArgs(['chunk', 'utf8'])).toEqual([
    'chunk',
    'utf8',
    undefined,
  ])
})

it('returns [chunk, encoding, cb] given all three arguments', () => {
  const callbackFn = () => {}
  expect(
    normalizeClientRequestWriteArgs(['chunk', 'utf8', callbackFn])
  ).toEqual(['chunk', 'utf8', callbackFn])
})
