import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'

test('handles [string, callback] input', () => {
  const [
    url,
    options,
    callback,
  ] = normalizeHttpRequestParams('https://mswjs.io/resource', function cb() {})

  // URL string must be converted to a URL instance
  expect(url.toJSON()).toEqual(new URL('https://mswjs.io/resource').toJSON())

  // Request options must be derived from the URL instance
  expect(options).toHaveProperty('method', 'GET')
  expect(options).toHaveProperty('protocol', 'https:')
  expect(options).toHaveProperty('hostname', 'mswjs.io')
  expect(options).toHaveProperty('path', '/resource')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [string, RequestOptions, callback] input', () => {
  const initialOptions = {
    headers: {
      'Content-Type': 'text/plain',
    },
  }
  const [
    url,
    options,
    callback,
  ] = normalizeHttpRequestParams(
    'https://mswjs.io/resource',
    initialOptions,
    function cb() {}
  )

  // URL must be created from the string
  expect(url.toJSON()).toEqual(new URL('https://mswjs.io/resource').toJSON())

  // Request options must be preserved
  expect(options).toEqual(initialOptions)

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [URL, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    new URL('https://mswjs.io/resource'),
    function cb() {}
  )

  // URL must be preserved
  expect(url.toJSON()).toEqual(new URL('https://mswjs.io/resource').toJSON())

  // Request options must be derived from the URL instance
  expect(options).toHaveProperty('method', 'GET')
  expect(options).toHaveProperty('protocol', 'https:')
  expect(options).toHaveProperty('hostname', 'mswjs.io')
  expect(options).toHaveProperty('path', '/resource')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [URL, RequestOptions, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    new URL('https://mswjs.io/resource'),
    {
      headers: {
        'Content-Type': 'text/plain',
      },
    },
    function cb() {}
  )

  // URL must be preserved
  expect(url.toJSON()).toEqual(new URL('https://mswjs.io/resource').toJSON())

  // Options must be preserved
  expect(options).toEqual({
    protocol: 'https:',
    headers: {
      'Content-Type': 'text/plain',
    },
  })

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [RequestOptions, callback] input', () => {
  const initialOptions = {
    method: 'POST',
    protocol: 'https:',
    host: 'mswjs.io',
    path: '/resource',
    headers: {
      'Content-Type': 'text/plain',
    },
  }
  const [url, options, callback] = normalizeHttpRequestParams(
    initialOptions,
    function cb() {}
  )

  // URL must be derived from request options
  expect(url.toJSON()).toEqual(new URL('https://mswjs.io/resource').toJSON())

  // Request options must be preserved
  expect(options).toEqual(initialOptions)

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

/**
 * @see https://github.com/mswjs/node-request-interceptor/issues/19
 */
test('handles [PartialRequestOptions, callback] input', () => {
  const initialOptions = {
    method: 'GET',
    port: '50176',
    path: '/resource',
    host: '127.0.0.1',
    ca: undefined,
    key: undefined,
    pfx: undefined,
    cert: undefined,
    passphrase: undefined,
    agent: false,
  }
  const [url, options, callback] = normalizeHttpRequestParams(
    initialOptions,
    function cb() {}
  )

  // URL must be derived from request options
  expect(url.toJSON()).toEqual(
    new URL('http://127.0.0.1:50176/resource').toJSON()
  )

  // Request options must be preserved
  expect(options).toEqual(initialOptions)

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})
