import { parse } from 'url';
import { getUrlByRequestOptions } from '../../../utils/getUrlByRequestOptions';
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'

test('handles [string, callback] input', () => {
  const [
    url,
    options,
    callback,
  ] = normalizeHttpRequestParams('http', 'https://mswjs.io/resource', function cb() {})

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
    'http',
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
    'http',
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

test('handles [Absolute Legacy URL, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
    parse('https://cherry:durian@mswjs.io:12345/resource?apple=banana'),
    function cb() {}
  )

  // URL must be preserved
  expect(url.toJSON()).toEqual(new URL('https://cherry:durian@mswjs.io:12345/resource?apple=banana').toJSON())

  // Request options must be derived from the URL instance
  expect(options).toHaveProperty('method', 'GET')
  expect(options).toHaveProperty('protocol', 'https:')
  expect(options).toHaveProperty('hostname', 'mswjs.io')
  expect(options).toHaveProperty('path', '/resource?apple=banana')
  expect(options).toHaveProperty('port', 12345)
  expect(options).toHaveProperty('auth', 'cherry:durian')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [Relative Legacy URL, RequestOptions without path set, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
    parse('/resource?apple=banana'),
    {host: 'mswjs.io'},
    function cb() {}
  )

  // Correct WHATWG URL generated
  expect(url.toJSON()).toEqual(new URL('http://mswjs.io/resource?apple=banana').toJSON())

  // No path in request options, so legacy url path is copied-in
  expect(options).toHaveProperty('protocol', 'http:')
  expect(options).toHaveProperty('host', 'mswjs.io')
  expect(options).toHaveProperty('path', '/resource?apple=banana')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [Relative Legacy URL, RequestOptions with path set, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
    parse('/resource?apple=banana'),
    {host: 'mswjs.io', path: '/other?cherry=durian'},
    function cb() {}
  )

  // Correct WHATWG URL generated
  expect(url.toJSON()).toEqual(new URL('http://mswjs.io/other?cherry=durian').toJSON())

  // Path in request options, so that path is preferred
  expect(options).toHaveProperty('protocol', 'http:')
  expect(options).toHaveProperty('host', 'mswjs.io')
  expect(options).toHaveProperty('path', '/other?cherry=durian')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [Relative Legacy URL, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
    parse('/resource?apple=banana'),
    function cb() {}
  )

  // Correct WHATWG URL generated
  expect(url.toJSON()).toMatch(getUrlByRequestOptions('http', {path: '/resource?apple=banana'}).toJSON())

  // Check path is in options
  expect(options).toHaveProperty('protocol', 'http:')
  expect(options).toHaveProperty('path', '/resource?apple=banana')

  // Callback must be preserved
  expect(callback).toHaveProperty('name', 'cb')
})

test('handles [Relative Legacy URL] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
    parse('/resource?apple=banana')
  )

  // Correct WHATWG URL generated
  expect(url.toJSON()).toMatch(getUrlByRequestOptions('http', {path: '/resource?apple=banana'}).toJSON())

  // Check path is in options
  expect(options).toHaveProperty('protocol', 'http:')
  expect(options).toHaveProperty('path', '/resource?apple=banana')

  // Callback must be preserved
  expect(callback).toBeUndefined()
})

test('handles [URL, RequestOptions, callback] input', () => {
  const [url, options, callback] = normalizeHttpRequestParams(
    'http',
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
    'http',
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

test('handles [Empty RequestOptions, callback] input', () => {
  const [_, __, callback] = normalizeHttpRequestParams(
    'http',
    {},
    function cb() {}
  )

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
    'http',
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
