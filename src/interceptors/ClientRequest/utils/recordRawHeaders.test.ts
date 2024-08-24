// @vitest-environment node
import { it, expect, afterEach } from 'vitest'
import {
  recordRawFetchHeaders,
  restoreHeadersPrototype,
  getRawFetchHeaders,
} from './recordRawHeaders'

const url = 'http://localhost'

afterEach(() => {
  restoreHeadersPrototype()
})

it('returns an empty list if no headers were set', () => {
  expect(getRawFetchHeaders(new Headers())).toEqual([])
  expect(getRawFetchHeaders(new Headers(undefined))).toEqual([])
  expect(getRawFetchHeaders(new Headers({}))).toEqual([])
  expect(getRawFetchHeaders(new Headers([]))).toEqual([])
  expect(getRawFetchHeaders(new Request(url).headers)).toEqual([])
  expect(getRawFetchHeaders(new Response().headers)).toEqual([])
})

it('records raw headers (Headers / object as init)', () => {
  recordRawFetchHeaders()
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-My-Header': '1',
  })

  expect(getRawFetchHeaders(headers)).toEqual([
    ['Content-Type', 'application/json'],
    ['X-My-Header', '1'],
  ])
  expect(Object.fromEntries(headers)).toEqual({
    'content-type': 'application/json',
    'x-my-header': '1',
  })
})

it('records raw headers (Headers / array as init)', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])

  expect(getRawFetchHeaders(headers)).toEqual([['X-My-Header', '1']])
  expect(Object.fromEntries(headers)).toEqual({
    'x-my-header': '1',
  })
})

it('records raw headers (Headers / Headers as init', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])

  expect(getRawFetchHeaders(new Headers(headers))).toEqual([
    ['X-My-Header', '1'],
  ])
})

it('records raw headers added via ".set()"', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])
  headers.set('X-Another-Header', '2')

  expect(getRawFetchHeaders(headers)).toEqual([
    ['X-My-Header', '1'],
    ['X-Another-Header', '2'],
  ])
})

it('records raw headers added via ".append()"', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])
  headers.append('X-My-Header', '2')

  expect(getRawFetchHeaders(headers)).toEqual([
    ['X-My-Header', '1'],
    ['X-My-Header', '2'],
  ])
})

it('deletes the header when called ".delete()"', () => {
  const headers = new Headers([['X-My-Header', '1']])
  headers.delete('X-My-Header')

  expect(getRawFetchHeaders(headers)).toEqual([])
})

it('records raw headers (Request / object as init)', () => {
  recordRawFetchHeaders()
  const request = new Request(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-My-Header': '1',
    },
  })

  expect(getRawFetchHeaders(request.headers)).toEqual([
    ['Content-Type', 'application/json'],
    ['X-My-Header', '1'],
  ])
})

it('records raw headers (Request / array as init)', () => {
  recordRawFetchHeaders()
  const request = new Request(url, {
    headers: [['X-My-Header', '1']],
  })

  expect(getRawFetchHeaders(request.headers)).toEqual([['X-My-Header', '1']])
})

it('records raw headers (Request / Headers as init)', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])
  const request = new Request(url, { headers })

  expect(getRawFetchHeaders(request.headers)).toEqual([['X-My-Header', '1']])
})

it('records raw headers (Response / object as init)', () => {
  recordRawFetchHeaders()
  const response = new Response(null, {
    headers: {
      'Content-Type': 'application/json',
      'X-My-Header': '1',
    },
  })

  expect(getRawFetchHeaders(response.headers)).toEqual([
    ['Content-Type', 'application/json'],
    ['X-My-Header', '1'],
  ])
})

it('records raw headers (Response / array as init)', () => {
  recordRawFetchHeaders()
  const response = new Response(null, {
    headers: [['X-My-Header', '1']],
  })

  expect(getRawFetchHeaders(response.headers)).toEqual([['X-My-Header', '1']])
})

it('records raw headers (Response / Headers as init)', () => {
  recordRawFetchHeaders()
  const headers = new Headers([['X-My-Header', '1']])
  const response = new Response(null, { headers })

  expect(getRawFetchHeaders(response.headers)).toEqual([['X-My-Header', '1']])
})

it('stops recording once the patches are restored', () => {
  restoreHeadersPrototype()

  const headers = new Headers({ 'X-My-Header': '1' })
  // Must return the normalized headers (no access to raw headers).
  expect(getRawFetchHeaders(headers)).toEqual([['x-my-header', '1']])
})
