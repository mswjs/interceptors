// @vitest-environment node
import tls from 'node:tls'
import { SocketInterceptor } from '#/src/interceptors/net'
import { createTestServer } from '#/test/helpers'
import { TLS_CERTIFICATE, TLS_PRIVATE_KEY } from './fixtures/tls'

const interceptor = new SocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits the "lookup" event when connecting to a hostname', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: 'localhost',
    family: 4,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const lookupListener = vi.fn()
  socket.on('lookup', lookupListener)
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect(lookupListener).toHaveBeenCalledExactlyOnceWith(
    null,
    '127.0.0.1',
    4,
    'localhost'
  )

  socket.destroy()
})

it('emits "secureConnect" exactly once', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const secureConnectListener = vi.fn()
  socket.on('secureConnect', secureConnectListener)

  await expect.poll(() => secureConnectListener).toHaveBeenCalled()
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })

  expect(secureConnectListener).toHaveBeenCalledOnce()

  socket.destroy()
})

it('emits the "session" event for a bypassed connection', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })

  const events: Array<string> = []
  const socketStatesOnSession: Array<Record<string, unknown>> = []
  socket.on('secureConnect', () => {
    events.push('secureConnect')
  })
  const sessionListener = vi.fn<(session: Buffer) => void>(() => {
    events.push('session')
    socketStatesOnSession.push({
      pending: socket.pending,
      connecting: socket.connecting,
      authorized: socket.authorized,
      readyState: socket.readyState,
      destroyed: socket.destroyed,
    })
  })
  socket.on('session', sessionListener)

  // A Node.js TLS server issues two TLS 1.3 session tickets by default,
  // each emitting a separate "session" event on the client.
  await expect.poll(() => sessionListener.mock.calls.length).toBe(2)
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  expect.soft(sessionListener).toHaveBeenCalledTimes(2)

  // In TLS 1.3, session tickets arrive only after the handshake is done.
  expect.soft(events).toEqual(['secureConnect', 'session', 'session'])

  for (const [sessionData] of sessionListener.mock.calls) {
    expect.soft(sessionData).toBeInstanceOf(Buffer)
    expect.soft(sessionData.byteLength).toBeGreaterThan(0)
  }

  expect(socketStatesOnSession).toEqual([
    {
      pending: false,
      connecting: false,
      authorized: true,
      readyState: 'open',
      destroyed: false,
    },
    {
      pending: false,
      connecting: false,
      authorized: true,
      readyState: 'open',
      destroyed: false,
    },
  ])

  socket.destroy()
})

it('emits the "session" event for a mocked connection', async () => {
  interceptor.on('connection', ({ controller }) => {
    controller.claim()
  })

  const socket = tls.connect(443, 'any.host.com')

  const events: Array<string> = []
  const socketStatesOnSession: Array<Record<string, unknown>> = []
  socket.on('secureConnect', () => {
    events.push('secureConnect')
  })
  const sessionListener = vi.fn<(session: Buffer) => void>(() => {
    events.push('session')
    socketStatesOnSession.push({
      pending: socket.pending,
      connecting: socket.connecting,
      authorized: socket.authorized,
      readyState: socket.readyState,
      destroyed: socket.destroyed,
    })
  })
  socket.on('session', sessionListener)

  // A Node.js TLS server issues two TLS 1.3 session tickets by default,
  // each emitting a separate "session" event on the client.
  await expect.poll(() => sessionListener.mock.calls.length).toBe(2)
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  expect.soft(sessionListener).toHaveBeenCalledTimes(2)

  // In TLS 1.3, session tickets arrive only after the handshake is done.
  expect.soft(events).toEqual(['secureConnect', 'session', 'session'])

  for (const [sessionData] of sessionListener.mock.calls) {
    expect.soft(sessionData).toBeInstanceOf(Buffer)
    expect.soft(sessionData.byteLength).toBeGreaterThan(0)
  }

  expect(socketStatesOnSession).toEqual([
    {
      pending: false,
      connecting: false,
      // Mocked connections are never authorized (no real peer certificate).
      authorized: false,
      readyState: 'open',
      destroyed: false,
    },
    {
      pending: false,
      connecting: false,
      authorized: false,
      readyState: 'open',
      destroyed: false,
    },
  ])

  socket.destroy()
})

it('emits the "keylog" event', async () => {
  await using server = await createTestServer(() => {
    return new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
  })
  const keylogListener = vi.fn()
  socket.on('keylog', keylogListener)

  await expect.poll(() => keylogListener).toHaveBeenCalled()
  expect(keylogListener).toHaveBeenCalledWith(expect.any(Buffer))

  socket.destroy()
})

it('emits the "OCSPResponse" event', async () => {
  await using server = await createTestServer(() => {
    const tlsServer = new tls.Server({
      cert: TLS_CERTIFICATE,
      key: TLS_PRIVATE_KEY,
    })
    tlsServer.on('OCSPRequest', (certificate, issuer, callback) => {
      callback(null, Buffer.from('mock-ocsp-response'))
    })
    return tlsServer
  })

  const socket = tls.connect({
    port: server.port,
    host: server.hostname,
    servername: 'localhost',
    ca: [TLS_CERTIFICATE],
    requestOCSP: true,
  })
  const ocspResponseListener = vi.fn()
  socket.on('OCSPResponse', ocspResponseListener)

  await expect.poll(() => ocspResponseListener).toHaveBeenCalledOnce()
  expect(ocspResponseListener).toHaveBeenCalledWith(
    Buffer.from('mock-ocsp-response')
  )

  socket.destroy()
})
