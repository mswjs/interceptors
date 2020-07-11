/**
 * @see https://github.com/mswjs/msw/issues/273
 */
import { RequestInterceptor } from '../../src'

const interceptor = new RequestInterceptor()

beforeAll(() => {
  interceptor.use((req) => {
    if (req.url.href === 'https://test.mswjs.io/user') {
      return {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-header': 'yes',
        },
        body: JSON.stringify({
          mocked: true,
        }),
      }
    }
  })
})

afterAll(() => {
  interceptor.restore()
})

test('calls the "load" event attached via "addEventListener" with a mocked response', (done) => {
  const xhr = new XMLHttpRequest()
  function handleResponse(this: XMLHttpRequest) {
    const { status, responseText } = this
    const headers = this.getAllResponseHeaders()

    expect(status).toBe(200)
    expect(headers).toContain('x-header: yes')
    expect(responseText).toBe(`{"mocked":true}`)

    done()
  }

  xhr.addEventListener('load', handleResponse)
  xhr.open('GET', 'https://test.mswjs.io/user')
  xhr.send()
})
