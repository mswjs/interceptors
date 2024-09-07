// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { encodeBuffer } from '../../../../src'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { toArrayBuffer } from '../../../../src/utils/bufferUtils'
import { createXMLHttpRequest, readBlob } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(
    new Response(
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  )
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds with an object when "responseType" equals "json"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.responseType = 'json'
    req.send()
  })

  expect(typeof req.response).toBe('object')
  expect(req.response).toEqual({
    firstName: 'John',
    lastName: 'Maverick',
  })
})

it('responds with a Blob when "responseType" equals "blob"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.responseType = 'blob'
    req.send()
  })

  const expectedBlob = new Blob(
    [
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      }),
    ],
    {
      type: 'application/json',
    }
  )

  const responseBlob: Blob = req.response
  const expectedBlobContents = await readBlob(responseBlob)

  expect(responseBlob).toBeInstanceOf(Blob)
  // Blob type must be inferred from the response's "Content-Type".
  expect(responseBlob).toHaveProperty('type', 'application/json')
  expect(responseBlob).toHaveProperty('size', expectedBlob.size)
  expect(expectedBlobContents).toEqual(
    JSON.stringify({
      firstName: 'John',
      lastName: 'Maverick',
    })
  )
})

it('responds with an ArrayBuffer when "responseType" equals "arraybuffer"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.responseType = 'arraybuffer'
    req.send()
  })

  const expectedArrayBuffer = toArrayBuffer(
    encodeBuffer(
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      })
    )
  )

  const responseBuffer = req.response as ArrayBuffer

  const isBufferEqual = (left: ArrayBuffer, right: ArrayBuffer): boolean => {
    const first = new Uint8Array(left)
    const last = new Uint8Array(right)
    return first.every((value, index) => last[index] === value)
  }

  // Must return an "ArrayBuffer" instance for "arraybuffer" response type.
  expect(responseBuffer.byteLength).toBe(expectedArrayBuffer.byteLength)
  expect(isBufferEqual(responseBuffer, expectedArrayBuffer)).toBe(true)
})
