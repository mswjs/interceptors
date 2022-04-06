/**
 * @jest-environment jsdom
 */
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, readBlob } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  request.respondWith({
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      firstName: 'John',
      lastName: 'Maverick',
    }),
  })
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

test('responds with an object when "responseType" equals "json"', async () => {
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

test('responds with a Blob when "responseType" equals "blob"', async () => {
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

test('responds with an ArrayBuffer when "responseType" equals "arraybuffer"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.responseType = 'arraybuffer'
    req.send()
  })

  const expectedArrayBuffer = new Uint8Array(
    Buffer.from(
      JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      })
    )
  )

  const responseBuffer: Uint8Array = req.response

  expect(Buffer.compare(responseBuffer, expectedArrayBuffer)).toBe(0)
})
