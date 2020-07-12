import { normalizeHttpRequestEndParams } from './normalizeHttpRequestEndParams'

test('supports [cb]', () => {
  const cb = () => null
  const args = [cb]
  expect(normalizeHttpRequestEndParams(...(args as any))).toEqual([
    null,
    null,
    cb,
  ])
})

test('supports [chunk]', () => {
  const args = ['chunk']
  expect(normalizeHttpRequestEndParams(...(args as any))).toEqual([
    'chunk',
    null,
    null,
  ])
})

test('supports [chunk, cb]', () => {
  const cb = () => null
  const args = ['chunk', cb]
  expect(normalizeHttpRequestEndParams(...(args as any))).toEqual([
    'chunk',
    null,
    cb,
  ])
})

test('supports [chunk, encoding]', () => {
  const args = ['chunk', 'utf8']
  expect(normalizeHttpRequestEndParams(...(args as any))).toEqual([
    'chunk',
    'utf8',
    null,
  ])
})

test('supports [chunk, encoding, cb]', () => {
  const cb = () => null
  const args = ['chunk', 'utf8', cb]
  expect(normalizeHttpRequestEndParams(...(args as any))).toEqual([
    'chunk',
    'utf8',
    cb,
  ])
})
