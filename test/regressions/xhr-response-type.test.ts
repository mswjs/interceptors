import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { readBlob } from '../helpers'

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

test('responds with an object when "responseType" equals "json"', (done) => {
  const req = new XMLHttpRequest()
  req.open('GET', '/arbitrary-url')
  req.responseType = 'json'

  req.addEventListener('loadend', () => {
    const { readyState, response } = req

    if (readyState === 4) {
      expect(typeof response).toBe('object')
      expect(response).toEqual({
        firstName: 'John',
        lastName: 'Maverick',
      })

      done()
    }
  })

  req.send()
})

test('responds with a Blob when "responseType" equals "blob"', (done) => {
  const req = new XMLHttpRequest()
  req.open('GET', '/arbitrary-url')
  req.responseType = 'blob'

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

  req.addEventListener('loadend', async () => {
    const { readyState, response } = req

    if (readyState === 4) {
      const responseBlob: Blob = response
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

      done()
    }
  })

  req.send()
})
