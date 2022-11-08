import { Request } from '@remix-run/web-fetch'
import { RequestWithCredentials } from './RequestWithCredentials'

it('remains an instance of "Request"', () => {
  const request = new RequestWithCredentials('https://example.com')

  expect(request).toBeInstanceOf(Request)
})

it('sets "credentials" to "same-origin" by default', () => {
  const request = new RequestWithCredentials('https://example.com')

  expect(request.url).toBe('https://example.com/')
  expect(request.method).toBe('GET')
  expect(request.credentials).toBe('same-origin')
})

it('sets "credentials" to a custom value', () => {
  const request = new RequestWithCredentials('https://example.com', {
    method: 'POST',
    credentials: 'omit',
  })

  expect(request.url).toBe('https://example.com/')
  expect(request.method).toBe('POST')
  expect(request.credentials).toBe('omit')
})
