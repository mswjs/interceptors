import net from 'node:net'
import {
  normalizeNetConnectArgs,
  type NormalizedNetConnectArgs,
} from './normalize-net-connect-args'

it('handles a single path as the argument', () => {
  expect(
    normalizeNetConnectArgs(['/resource'])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      path: '/resource',
    },
    undefined,
  ])

  const callback = () => void 0
  expect(
    normalizeNetConnectArgs(['/resource', callback])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      path: '/resource',
    },
    callback,
  ])
})

it('handles a port and host as the arguments', () => {
  expect(
    normalizeNetConnectArgs([443, '127.0.0.1'])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      port: 443,
      host: '127.0.0.1',
      path: '',
    },
    undefined,
  ])

  const callback = () => void 0
  expect(
    normalizeNetConnectArgs([443, '127.0.0.1', callback])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      port: 443,
      host: '127.0.0.1',
      path: '',
    },
    callback,
  ])
})

it('handles a URL as the argument', () => {
  expect(
    normalizeNetConnectArgs([new URL('https://localhost:3000')])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      protocol: 'https:',
      port: 3000,
      host: 'localhost',
      path: '/',
    },
    undefined,
  ])

  {
    const callback = () => void 0
    expect(
      normalizeNetConnectArgs([new URL('https://localhost:3000'), callback])
    ).toEqual<NormalizedNetConnectArgs>([
      {
        protocol: 'https:',
        port: 3000,
        host: 'localhost',
        path: '/',
      },
      callback,
    ])
  }

  expect(
    normalizeNetConnectArgs([new URL('https://localhost:3000/resource')])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      protocol: 'https:',
      port: 3000,
      host: 'localhost',
      path: '/resource',
    },
    undefined,
  ])

  {
    const callback = () => void 0
    expect(
      normalizeNetConnectArgs([
        new URL('https://localhost:3000/resource'),
        callback,
      ])
    ).toEqual<NormalizedNetConnectArgs>([
      {
        protocol: 'https:',
        port: 3000,
        host: 'localhost',
        path: '/resource',
      },
      callback,
    ])
  }
})

it('handles connection options object as the argument', () => {
  expect(
    normalizeNetConnectArgs([
      { path: '/resource' } satisfies net.IpcNetConnectOpts,
    ])
  ).toEqual<NormalizedNetConnectArgs>([{ path: '/resource' }, undefined])

  expect(
    normalizeNetConnectArgs([
      { port: 443, host: '127.0.0.1' } satisfies net.TcpNetConnectOpts,
    ])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      port: 443,
      host: '127.0.0.1',
      path: '',
    },
    undefined,
  ])

  expect(
    normalizeNetConnectArgs([
      {
        port: 443,
        host: '127.0.0.1',
        family: 6,
        localAddress: '::1',
        localPort: 80,
      } satisfies net.TcpNetConnectOpts,
    ])
  ).toEqual<NormalizedNetConnectArgs>([
    {
      port: 443,
      host: '127.0.0.1',
      path: '',
      family: 6,
      localAddress: '::1',
      localPort: 80,
    },
    undefined,
  ])
})
