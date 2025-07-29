import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import http from 'node:http'
import net from 'node:net'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { ClientRequestInterceptor } from '.'
import { sleep, waitForClientRequest } from '../../../test/helpers'
import * as agents from './agents'
import { MockHttpSocket } from './MockHttpSocket'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.restoreAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('abort the request if the abort signal is emitted', async () => {
  const requestUrl = httpServer.http.url('/')

  interceptor.on('request', async function delayedResponse({ controller }) {
    await sleep(1_000)
    controller.respondWith(new Response())
  })

  const abortController = new AbortController()
  const request = http.get(requestUrl, { signal: abortController.signal })

  abortController.abort()

  const abortErrorPromise = new DeferredPromise<Error>()
  request.on('error', function (error) {
    abortErrorPromise.resolve(error)
  })

  const abortError = await abortErrorPromise
  expect(abortError.name).toEqual('AbortError')

  expect(request.destroyed).toBe(true)
})

it('patch the Headers object correctly after dispose and reapply', async () => {
  interceptor.dispose()
  interceptor.apply()

  interceptor.on('request', ({ controller }) => {
    const headers = new Headers({
      'X-CustoM-HeadeR': 'Yes',
    })
    controller.respondWith(new Response(null, { headers }))
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers['x-custom-header']).toEqual('Yes')
})

describe('Unix socket handling', () => {
  // Skip these tests in environments that don't support Unix sockets
  if (process.platform === 'win32') {
    it.skip('Unix socket tests are skipped on Windows', () => {})
    return
  }

  it('verifies socketPath property is passed to MockAgent', () => {
    // Given
    const socketPath = '/tmp/test.sock'
    const agentOptions = {
      socketPath,
      customAgent: undefined,
      onRequest: vi.fn(),
      onResponse: vi.fn(),
    }

    // When
    const agent = new agents.MockAgent(agentOptions)

    // Then
    expect(agent).toBeDefined()
    // Access private property for testing
    expect((agent as any).socketPath).toBe(socketPath)
  })

  it('verifies socketPath property is passed to MockHttpsAgent', () => {
    // Given
    const socketPath = '/tmp/test.sock'
    const agentOptions = {
      socketPath,
      customAgent: undefined,
      onRequest: vi.fn(),
      onResponse: vi.fn(),
    }

    // When
    const agent = new agents.MockHttpsAgent(agentOptions)

    // Then
    expect(agent).toBeDefined()
    // Access private property for testing
    expect((agent as any).socketPath).toBe(socketPath)
  })

  it('verifies socketPath is used during MockHttpSocket passthrough', () => {
    // Given
    const socketPath = '/tmp/test.sock'
    const mockSocket = {
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      address: vi.fn(),
    }

    // Mock net.createConnection
    const createConnectionSpy = vi
      .spyOn(net, 'createConnection')
      .mockImplementation(() => mockSocket as any)

    // Create MockHttpSocket with socketPath in options
    const socket = new MockHttpSocket({
      connectionOptions: { socketPath },
      createConnection: () => net.createConnection({ path: socketPath }),
      onRequest: vi.fn(),
      onResponse: vi.fn(),
    })

    // When
    socket.passthrough()

    // Then
    expect(createConnectionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: socketPath })
    )
  })
})
