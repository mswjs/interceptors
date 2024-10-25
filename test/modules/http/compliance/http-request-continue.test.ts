// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.post('/resource', (req, res) => {
    req.on('data', (chunk) =>
      console.log('[server] req data:', chunk.toString())
    )
    console.log('!!![server] added req.on(data)')

    req.pipe(res)
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('emits "continue" event for a request with "100-continue" expect header', async () => {
  interceptor
    .on('request', ({ request }) => {
      console.log('[*] request', request.method, request.url)
    })
    .on('response', ({ request, response }) => {
      console.log('[*] response', response.status, request.method, request.url)
    })

  const request = http.request(httpServer.http.url('/resource'), {
    method: 'POST',
    headers: {
      expect: '100-continue',
    },
  })

  const continueListener = vi.fn()
  request.on('continue', continueListener)
  request.on('continue', () => {
    console.log('REQ CONTINUE')
    console.log('REQ END')

    console.log('!!!! writing request...')
    request.end('hello')
  })
  request.on('finish', () => console.log('REQ FINISH'))
  request.on('response', () => console.log('REQ RESPONSE'))

  request.on('socket', (socket) => {
    socket.write = new Proxy(socket.write, {
      apply(target, thisArg, args) {
        console.log('SOCKET WRITE', args[0].toString())
        return Reflect.apply(target, thisArg, args)
      },
    })
    socket.push = new Proxy(socket.push, {
      apply(target, thisArg, args) {
        console.log('SOCKET PUSH', args[0].toString())
        return Reflect.apply(target, thisArg, args)
      },
    })
    socket.emit = new Proxy(socket.emit, {
      apply(target, thisArg, args) {
        console.log(
          'SOCKET EMIT',
          args[0] === 'data' ? ['data', args[1].toString()] : args
        )
        return Reflect.apply(target, thisArg, args)
      },
    })

    socket.on('connect', () => console.log('SOCKET CONNECT'))
    // socket.on('data', (chunk) =>
    //   console.log('SOCKET DATA:\n', chunk.toString())
    // )
    socket.on('finish', () => console.log('SOCKET FINISH'))
    socket.on('close', () => console.log('SOCKET CLOSE'))
    socket.on('error', () => console.log('SOCKET ERROR!!!'))
    socket.on('end', () => console.log('SOCKET END'))
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  await expect(text()).resolves.toBe('hello')
  expect(continueListener).toHaveBeenCalledOnce()
})

it.todo('emits "continue" event for a ')
