/**
 * @vitest-environment node
 * @see https://github.com/mswjs/interceptors/issues/XXX
 */
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import type { TLSSocket } from 'node:tls'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('original-response')
  })
  app.post('/echo', (req, res) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      res.status(200).json({ received: body })
    })
  })
})

const interceptor = new ClientRequestInterceptor()

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

it('emits "secureConnect" event for passthrough HTTPS requests when client waits for it before writing', async () => {
  // This test reproduces the Stripe SDK pattern where the client waits
  // for secureConnect before writing data to ensure TLS handshake is complete.
  // The issue is that when a request is NOT mocked (passthrough), the MockHttpSocket
  // doesn't emit secureConnect at the right time, causing clients to hang.
  
  const secureConnectListener = vi.fn()
  const responseListener = vi.fn()
  const errorListener = vi.fn()
  
  const requestData = JSON.stringify({ test: 'data' })
  
  const request = https.request(httpServer.https.url('/echo'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    },
    rejectUnauthorized: false // Allow self-signed cert from test server
  })
  
  request.on('error', errorListener)
  
  request.on('response', (res) => {
    responseListener()
    
    let body = ''
    res.on('data', chunk => body += chunk)
    res.on('end', () => {
      expect(JSON.parse(body)).toEqual({ received: requestData })
    })
  })
  
  // This is the critical pattern from Stripe SDK:
  // Wait for the socket and then wait for secureConnect before writing
  request.once('socket', (socket) => {
    console.log('HTTPS test - socket received, connecting:', socket.connecting)
    expect(socket).toBeDefined()
    
    // The socket should indicate it's a TLS socket
    const tlsSocket = socket as TLSSocket
    expect(tlsSocket.encrypted).toBe(true)
    
    if (socket.connecting) {
      console.log('HTTPS test - socket is connecting, waiting for secureConnect')
      // Client waits for secureConnect before writing data
      // This is where the bug occurs - secureConnect never fires for passthrough
      socket.once('secureConnect', () => {
        console.log('HTTPS test - secureConnect received')
        secureConnectListener()
        request.write(requestData)
        request.end()
      })
    } else {
      console.log('HTTPS test - socket already connected')
      // Socket is already connected
      secureConnectListener()
      request.write(requestData)
      request.end()
    }
  })
  
  // Wait for the request to complete
  // This will timeout if secureConnect is never emitted
  await vi.waitFor(() => {
    expect(responseListener).toHaveBeenCalledTimes(1)
  }, { timeout: 5000 })
  
  // Verify the secureConnect event was handled
  expect(secureConnectListener).toHaveBeenCalledTimes(1)
  expect(errorListener).not.toHaveBeenCalled()
})

it('emits "connect" event for passthrough HTTP requests when client waits for it before writing', async () => {
  // Similar test for HTTP to ensure connect event works correctly
  
  const connectListener = vi.fn()
  const responseListener = vi.fn()
  const errorListener = vi.fn()
  
  const requestData = JSON.stringify({ test: 'data' })
  
  const request = http.request(httpServer.http.url('/echo'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    }
  })
  
  request.on('error', errorListener)
  
  request.on('response', (res) => {
    responseListener()
    
    let body = ''
    res.on('data', chunk => body += chunk)
    res.on('end', () => {
      expect(JSON.parse(body)).toEqual({ received: requestData })
    })
  })
  
  // Pattern similar to Stripe SDK but for HTTP
  request.once('socket', (socket) => {
    expect(socket).toBeDefined()
    
    if (socket.connecting) {
      // Client waits for connect before writing data
      socket.once('connect', () => {
        connectListener()
        request.write(requestData)
        request.end()
      })
    } else {
      // Socket is already connected
      connectListener()
      request.write(requestData)
      request.end()
    }
  })
  
  // Wait for the request to complete
  await vi.waitFor(() => {
    expect(responseListener).toHaveBeenCalledTimes(1)
  }, { timeout: 5000 })
  
  // Verify the connect event was handled
  expect(connectListener).toHaveBeenCalledTimes(1)
  expect(errorListener).not.toHaveBeenCalled()
})

it('emits "secureConnect" for mocked HTTPS requests when client waits for it before writing', async () => {
  // Verify that mocked responses work correctly (this should already work)
  
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.includes('/mocked')) {
      controller.respondWith(new Response(JSON.stringify({ mocked: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    }
  })
  
  const secureConnectListener = vi.fn()
  const responseListener = vi.fn()
  
  const requestData = JSON.stringify({ test: 'data' })
  
  const request = https.request(httpServer.https.url('/mocked'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    },
    rejectUnauthorized: false
  })
  
  request.on('response', (res) => {
    responseListener()
    
    let body = ''
    res.on('data', chunk => body += chunk)
    res.on('end', () => {
      expect(JSON.parse(body)).toEqual({ mocked: true })
    })
  })
  
  request.once('socket', (socket) => {
    if (socket.connecting) {
      socket.once('secureConnect', () => {
        secureConnectListener()
        request.write(requestData)
        request.end()
      })
    } else {
      secureConnectListener()
      request.write(requestData)
      request.end()
    }
  })
  
  // Wait for the request to complete
  await vi.waitFor(() => {
    expect(responseListener).toHaveBeenCalledTimes(1)
  }, { timeout: 5000 })
  
  // This should work for mocked responses
  expect(secureConnectListener).toHaveBeenCalledTimes(1)
})