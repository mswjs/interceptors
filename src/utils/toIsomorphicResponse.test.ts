import { Headers } from 'headers-polyfill'
import { toIsomorphicResponse } from './toIsomorphicResponse'

test('returns a well-formed empty response', () => {
  expect(toIsomorphicResponse({})).toEqual({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
  })
})

test('uses fallback values for the missing response properties', () => {
  expect(toIsomorphicResponse({ status: 301, body: 'text-body' })).toEqual({
    status: 301,
    statusText: 'OK',
    headers: new Headers(),
    body: 'text-body',
  })
})

test('returns a full response as-is, converting the headers', () => {
  expect(
    toIsomorphicResponse({
      status: 301,
      statusText: 'Custom Status',
      headers: {
        'X-Allowed': 'yes',
      },
      body: 'text-body',
    })
  ).toEqual({
    status: 301,
    statusText: 'Custom Status',
    headers: new Headers({
      'X-Allowed': 'yes',
    }),
    body: 'text-body',
  })
})
