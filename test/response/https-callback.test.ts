/**
 * @jest-environment node
 */
import https from 'https'
import { IncomingMessage } from 'http'
import { RequestInterceptor } from '../../src'

const interceptor = new RequestInterceptor()

beforeAll(() =>
  interceptor.use((req) => {
    if (req.url.href === 'https://httpbin.org/get') {
      return
    }

    return {
      status: 403,
      body: 'mocked-body',
    }
  })
)

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => {
  interceptor.restore()
})

test('calls a custom callback once when the request is bypassed', (done) => {
  let resBody: string = ''

  const customCallback = jest.fn<void, [IncomingMessage]>((res) => {
    res.on('data', (chunk) => (resBody += chunk))
    res.on('end', () => {
      // Check that the request was bypassed.
      expect(resBody).toContain(`"url": "https://httpbin.org/get"`)

      // Custom callback to `https.get` must be called once.
      expect(customCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get('https://httpbin.org/get', customCallback).end()
})

test('calls a custom callback once when the response is mocked', (done) => {
  let resBody: string = ''

  const customCallback = jest.fn<void, [IncomingMessage]>((res) => {
    res.on('data', (chunk) => (resBody += chunk))
    res.on('end', () => {
      // Check that the response was mocked.
      expect(resBody).toEqual('mocked-body')

      // Custom callback to `https.get` must be called once.
      expect(customCallback).toBeCalledTimes(1)
      done()
    })
  })

  https.get('https://httpbin.org/arbitrary', customCallback).end()
})
