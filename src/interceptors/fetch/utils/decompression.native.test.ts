// @vitest-environment node
import { it, expect } from 'vitest'
import { decompressResponse } from './decompression.native'

it('returns null for any response', () => {
  expect(decompressResponse(new Response('hello'))).toBeNull()
  expect(
    decompressResponse(
      new Response('body', {
        headers: { 'content-encoding': 'gzip' },
      }),
    ),
  ).toBeNull()
})
