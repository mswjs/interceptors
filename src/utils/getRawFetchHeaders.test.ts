import { it, expect } from 'vitest'
import { getRawFetchHeaders } from './getRawFetchHeaders'

it('returns undefined given a non-Headers object', () => {
  expect(getRawFetchHeaders({} as Headers)).toBeUndefined()
})

it('returns an empty Map given an empty Headers instance', () => {
  expect(getRawFetchHeaders(new Headers())).toEqual(new Map())
})

it('returns undefined for headers map on older Node.js versions', () => {
  // Emulate the Headers symbol structure on older
  // versions of Node.js (e.g. 18.8.0).
  const headers = {
    [Symbol('headers list')]: {
      [Symbol('headers map')]: new Map([['header-name', 'header-value']]),
    },
  }
  expect(getRawFetchHeaders(headers as unknown as Headers)).toBeUndefined()
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

it('returns raw headers for a header with multiple values', () => {
  expect(
    getRawFetchHeaders(
      new Headers([
        ['Set-CookiE', 'a=b'],
        ['Set-CookiE', 'c=d'],
      ])
    )
  ).toEqual(new Map([['Set-CookiE', 'a=b, c=d']]))
})
