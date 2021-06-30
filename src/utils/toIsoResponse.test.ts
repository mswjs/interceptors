import { Headers } from 'headers-utils'
import { toIsoResponse } from './toIsoResponse'

it('returns a well-formed empty response', () => {
  expect(toIsoResponse({})).toEqual({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
  })
})

it('uses fallback values for the missing response properties', () => {
  expect(toIsoResponse({ status: 301, body: 'text-body' })).toEqual({
    status: 301,
    statusText: 'OK',
    headers: new Headers(),
    body: 'text-body',
  })
})

it('returns a full response as-is, converting the headers', () => {
  expect(
    toIsoResponse({
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
