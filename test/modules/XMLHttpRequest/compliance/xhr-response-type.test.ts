// @vitest-environment jsdom
import { encodeBuffer } from '#/src/index'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { toArrayBuffer } from '#/src/utils/bufferUtils'
import { readBlob, waitForXMLHttpRequest } from '#/test/helpers'

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
  const request = new XMLHttpRequest()
  request.open('GET', '/arbitrary-url')
  request.responseType = 'json'
  request.send()

  await waitForXMLHttpRequest(request)

  expect(typeof request.response).toBe('object')
  expect(request.response).toEqual({
    firstName: 'John',
    lastName: 'Maverick',
  })
})

it('responds with a Blob when "responseType" equals "blob"', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', '/arbitrary-url')
  request.responseType = 'blob'
  request.send()

  await waitForXMLHttpRequest(request)

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

  const responseBlob: Blob = request.response
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
  const request = new XMLHttpRequest()
  request.open('GET', '/arbitrary-url')
  request.responseType = 'arraybuffer'
  request.send()

  await waitForXMLHttpRequest(request)

  const expectedArrayBuffer = toArrayBuffer(
    encodeBuffer(
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      })
    )
  )

  const responseBuffer = request.response as ArrayBuffer

  const isBufferEqual = (left: ArrayBuffer, right: ArrayBuffer): boolean => {
    const first = new Uint8Array(left)
    const last = new Uint8Array(right)
    return first.every((value, index) => last[index] === value)
  }

  // Must return an "ArrayBuffer" instance for "arraybuffer" response type.
  expect(responseBuffer.byteLength).toBe(expectedArrayBuffer.byteLength)
  expect(isBufferEqual(responseBuffer, expectedArrayBuffer)).toBe(true)
})
