import {
  normalizeNetConnectArgs,
  type NetConnectArgs,
} from './normalize-net-connect-args'

it('normalizes an empty arguments list', () => {
  expect(normalizeNetConnectArgs([])).toEqual([{ path: '' }, null])
})

it('normalizes "(port)"', () => {
  expect(normalizeNetConnectArgs([8080])).toEqual([
    {
      port: 8080,
      path: '',
      host: undefined,
    },
    null,
  ])
})

it('normalizes "(port, callback)"', () => {
  const callback = () => {}

  expect(normalizeNetConnectArgs([8080, callback])).toEqual([
    {
      port: 8080,
      path: '',
      host: undefined,
    },
    callback,
  ])
})

it('normalizes "(port, host)"', () => {
  expect(normalizeNetConnectArgs([8080, 'example.com'])).toEqual([
    {
      port: 8080,
      path: '',
      host: 'example.com',
    },
    null,
  ])
})

it('normalizes "(port, host, callback)"', () => {
  const callback = () => {}

  expect(normalizeNetConnectArgs([8080, 'example.com', callback])).toEqual([
    {
      port: 8080,
      path: '',
      host: 'example.com',
    },
    callback,
  ])
})

it('normalizes a zero port', () => {
  expect(normalizeNetConnectArgs([0, 'example.com'])).toEqual([
    {
      port: 0,
      path: '',
      host: 'example.com',
    },
    null,
  ])
})

it('normalizes "(options)"', () => {
  expect(
    normalizeNetConnectArgs([{ port: 8080, host: 'example.com' }])
  ).toEqual([
    {
      port: 8080,
      path: '',
      host: 'example.com',
      auth: undefined,
      family: undefined,
      session: undefined,
      localAddress: undefined,
      localPort: undefined,
    },
    null,
  ])
})

it('normalizes "(options, callback)"', () => {
  const callback = () => {}

  expect(
    normalizeNetConnectArgs([{ port: 8080, host: 'example.com' }, callback])
  ).toEqual([
    {
      port: 8080,
      path: '',
      host: 'example.com',
    },
    callback,
  ])
})

it('normalizes "(options)" with connection-specific options', () => {
  const session = Buffer.from('session')

  expect(
    normalizeNetConnectArgs([
      {
        port: 8080,
        host: 'example.com',
        family: 6,
        localAddress: '10.0.0.1',
        localPort: 34567,
      },
    ])
  ).toEqual([
    {
      port: 8080,
      path: '',
      host: 'example.com',
      family: 6,
      localAddress: '10.0.0.1',
      localPort: 34567,
    },
    null,
  ])

  expect(
    normalizeNetConnectArgs([
      // The type definitions of "net.connect()" omit
      // the TLS-specific options ("auth", "session").
      Object.assign({ port: 8080 }, { auth: 'user:pass', session }),
    ])
  ).toEqual([
    expect.objectContaining({
      port: 8080,
      auth: 'user:pass',
      session,
    }),
    null,
  ])
})

it('normalizes "(options)" with the "path" option', () => {
  expect(normalizeNetConnectArgs([{ path: '/tmp/service.sock' }])).toEqual([
    {
      path: '/tmp/service.sock',
      auth: undefined,
      family: undefined,
      session: undefined,
    },
    null,
  ])
})

it('normalizes "(path)"', () => {
  expect(normalizeNetConnectArgs(['/tmp/service.sock'])).toEqual([
    {
      path: '/tmp/service.sock',
    },
    null,
  ])
})

it('normalizes "(path, callback)"', () => {
  const callback = () => {}

  expect(normalizeNetConnectArgs(['/tmp/service.sock', callback])).toEqual([
    {
      path: '/tmp/service.sock',
    },
    callback,
  ])
})

/**
 * @note Node.js does not support URL arguments and reads them
 * as plain options objects. Reproduce that reading exactly:
 * "url.port" is a string, "url.host" includes the port.
 */
it('treats "(url)" as a plain options object, like Node.js', () => {
  expect(
    normalizeNetConnectArgs([new URL('http://example.com:8080/path?query=1')])
  ).toEqual([
    {
      path: '',
      port: '8080',
      host: 'example.com:8080',
    },
    null,
  ])
})

it('treats a port-less "(url)" as a plain options object, like Node.js', () => {
  expect(normalizeNetConnectArgs([new URL('http://example.com/')])).toEqual([
    {
      path: '',
      port: '',
      host: 'example.com',
    },
    null,
  ])
})

it('normalizes "(url, callback)"', () => {
  const callback = () => {}

  expect(
    normalizeNetConnectArgs([new URL('http://example.com:8080/'), callback])
  ).toEqual([
    expect.objectContaining({
      port: '8080',
      host: 'example.com:8080',
    }),
    callback,
  ])
})

it('returns a new options object for the "(options)" signature', () => {
  const inputOptions = { port: 8080, host: 'example.com' }
  const [normalizedOptions] = normalizeNetConnectArgs([inputOptions])

  expect(normalizedOptions).not.toBe(inputOptions)

  // Modifying the normalized options must not affect the input.
  normalizedOptions.host = 'changed.com'
  expect(inputOptions).toEqual({ port: 8080, host: 'example.com' })
})

it('throws on invalid arguments', () => {
  expect(() => {
    return normalizeNetConnectArgs([true] as unknown as NetConnectArgs)
  }).toThrow('Invalid arguments passed to net.connect: true')
})
