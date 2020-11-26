import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'

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
