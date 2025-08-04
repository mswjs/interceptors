// @vitest-environment node
import { setTimeout } from 'node:timers/promises'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { HttpServer } from '@open-draft/test-server/lib/http'
import { waitForClientRequest } from '../../../helpers'
import { type Socket } from 'node:net'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => res.sendStatus(200))
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
  interceptor.dispose()
})

afterAll(async () => {
  await httpServer.close()
})

const scenarios = [
  {
    condition: 'when the interceptor is not enabled [baseline test]',
    setup: () => {},
  },
  {
    condition: 'for a bypassed response',
    setup: () => {
      interceptor.apply()
    },
  },
  {
    condition: 'for a mocked response',
    setup: () => {
      interceptor.apply()
      interceptor.on('request', ({ controller }) => {
        controller.respondWith(new Response('hello world'))
      })
    },
  },
]

scenarios.forEach(({ condition, setup }) => {
  it(`emits the "error" event to the socket, response and request when the response is destroyed ${condition}`, async () => {
    setup()

    const socketErrorListener = vi.fn()
    const responseErrorListener = vi.fn()
    const requestErrorListener = vi.fn()

    let socket: Socket
    const responseError = new Error('reason')

    const request = http
      .get(httpServer.http.url('/'))
      .on('socket', (newSocket) => {
        newSocket.on('error', socketErrorListener)
        socket = newSocket
      })
      .on('response', (response) => {
        response.on('error', responseErrorListener)
        response.destroy(responseError)
      })
      .on('error', requestErrorListener)

    const { res } = await waitForClientRequest(request)

    await setTimeout(0)

    expect(res.destroyed).toBe(true)
    expect(responseErrorListener).toHaveBeenCalledOnce()
    expect(responseErrorListener).toHaveBeenCalledWith(responseError)

    // @ts-expect-error
    expect(socket?.destroyed).toBe(true)
    expect(socketErrorListener).toHaveBeenCalledOnce()
    expect(socketErrorListener).toHaveBeenCalledWith(responseError)

    expect(request.destroyed).toBe(true)
    expect(requestErrorListener).toHaveBeenCalledOnce()
    expect(requestErrorListener).toHaveBeenCalledWith(responseError)
  })

  it(`emits the "error" event to the socket and request when the socket is destroyed ${condition}`, async () => {
    setup()

    const socketErrorListener = vi.fn()
    const responseErrorListener = vi.fn()
    const requestErrorListener = vi.fn()

    let socket: Socket

    const socketError = new Error('reason')

    const request = http
      .get(httpServer.http.url('/'))
      .on('socket', (newSocket) => {
        newSocket.on('error', socketErrorListener)
        socket = newSocket
      })
      .on('response', (response) => {
        response.on('error', responseErrorListener)
        socket.destroy(socketError)
      })
      .on('error', requestErrorListener)

    const { res } = await waitForClientRequest(request)

    await setTimeout(0)

    expect(res.destroyed).toBe(false)
    expect(responseErrorListener).not.toHaveBeenCalled()

    // @ts-expect-error
    expect(socket?.destroyed).toBe(true)
    expect(socketErrorListener).toHaveBeenCalledOnce()
    expect(socketErrorListener).toHaveBeenCalledWith(socketError)

    expect(request.destroyed).toBe(true)
    expect(requestErrorListener).toHaveBeenCalledOnce()
    expect(requestErrorListener).toHaveBeenCalledWith(socketError)
  })

  it(`emits the "error" event to the socket and request when the request is destroyed ${condition}`, async () => {
    setup()

    const socketErrorListener = vi.fn()
    const responseErrorListener = vi.fn()
    const requestErrorListener = vi.fn()

    let socket: Socket

    const requestError = new Error('reason')

    const request = http
      .get(httpServer.http.url('/'))
      .on('socket', (newSocket) => {
        newSocket.on('error', socketErrorListener)
        socket = newSocket
      })
      .on('response', (response) => {
        response.on('error', responseErrorListener)
        request.destroy(requestError)
      })
      .on('error', requestErrorListener)

    const { res } = await waitForClientRequest(request)

    await setTimeout(0)

    expect(res.destroyed).toBe(true)
    expect(responseErrorListener).not.toHaveBeenCalled()

    // @ts-expect-error
    expect(socket?.destroyed).toBe(true)
    expect(socketErrorListener).toHaveBeenCalledOnce()
    expect(socketErrorListener).toHaveBeenCalledWith(requestError)

    expect(request.destroyed).toBe(true)
    expect(requestErrorListener).toHaveBeenCalledOnce()
    expect(requestErrorListener).toHaveBeenCalledWith(requestError)
  })
})
