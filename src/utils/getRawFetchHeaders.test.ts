import { it, expect } from 'vitest'
import { getRawFetchHeaders } from './getRawFetchHeaders'

it('returns undefined given a non-Headers object', () => {
  expect(getRawFetchHeaders({} as Headers)).toBeUndefined()
})

it('returns an empty Map given an empty Headers instance', () => {
  expect(getRawFetchHeaders(new Headers())).toEqual(new Map())
})

it('returns raw headers from the given Headers instance', () => {
  expect(
    getRawFetchHeaders(
      new Headers([
        ['lowercase-header', 'one'],
        ['UPPERCASE-HEADER', 'TWO'],
        ['MiXeD-cAsE-hEaDeR', 'ThReE'],
      ])
    )
  ).toEqual(
    new Map([
      ['lowercase-header', 'one'],
      ['UPPERCASE-HEADER', 'TWO'],
      ['MiXeD-cAsE-hEaDeR', 'ThReE'],
    ])
  )
})
