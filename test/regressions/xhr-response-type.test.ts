import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { createXMLHttpRequest, readBlob } from '../helpers'

let requestInterceptor: RequestInterceptor

beforeAll(() => {
  requestInterceptor = new RequestInterceptor(withDefaultInterceptors)
  requestInterceptor.use((req) => {
    return {
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Maverick',
      }),
    }
  })
})

afterAll(() => {
  requestInterceptor.restore()
})

test('responds with an object when "responseType" equals "json"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.responseType = 'json'
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
