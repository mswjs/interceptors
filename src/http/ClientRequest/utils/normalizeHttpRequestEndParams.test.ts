import { normalizeHttpRequestEndParams } from './normalizeHttpRequestEndParams'

test('supports [cb]', () => {
  const cb = () => undefined
  expect(normalizeHttpRequestEndParams(cb)).toEqual([null, null, cb])
})

test('supports [chunk]', () => {
  expect(normalizeHttpRequestEndParams('chunk')).toEqual(['chunk', null, null])
})

test('supports [chunk, cb]', () => {
  const cb = () => undefined
  expect(normalizeHttpRequestEndParams('chunk', cb)).toEqual([
    'chunk',
    null,
    cb,
  ])
})

test('supports [chunk, encoding]', () => {
  expect(normalizeHttpRequestEndParams('chunk', 'utf8')).toEqual([
    'chunk',
    'utf8',
    null,
  ])
})

test('supports [chunk, encoding, cb]', () => {
  const cb = () => undefined
  expect(normalizeHttpRequestEndParams('chunk', 'utf8', cb)).toEqual([
    'chunk',
    'utf8',
    cb,
  ])
})
