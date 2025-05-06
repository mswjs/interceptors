/**
 * @vitest-environment node
 */
import fs from 'node:fs'
import http from 'node:http'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

// Paths to test unix sockets
const HTTP_SOCKET_PATH = path.join(__dirname, 'test-http.sock')
const NONEXISTENT_SOCKET_PATH = path.join(__dirname, 'nonexistent.sock')

// Set up and tear down test environment
let httpServer: http.Server
let interceptor: ClientRequestInterceptor

beforeAll(async () => {
  // Clean up existing sockets if they exist
  if (fs.existsSync(HTTP_SOCKET_PATH)) {
    fs.unlinkSync(HTTP_SOCKET_PATH)
  }
  if (fs.existsSync(NONEXISTENT_SOCKET_PATH)) {
    fs.unlinkSync(NONEXISTENT_SOCKET_PATH)
  }

  // Create HTTP Unix socket server
  httpServer = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Test-Header': 'test-value',
      })
      res.end(
        JSON.stringify({
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: body || null,
        })
      )
    })
  })

  // Start servers
  await new Promise<void>((resolve) => {
    httpServer.listen(HTTP_SOCKET_PATH, () => {
      resolve()
    })
  })

  // Set up interceptor
  interceptor = new ClientRequestInterceptor()
  interceptor.apply()
})

afterAll(async () => {
  // Safely dispose the interceptor
  if (interceptor) {
    interceptor.dispose()
  }

  // Close server
  await new Promise<void>((resolve) => {
    if (httpServer) {
      httpServer.close(() => resolve())
    } else {
      resolve()
    }
  })

  // Clean up socket files
  if (fs.existsSync(HTTP_SOCKET_PATH)) {
    fs.unlinkSync(HTTP_SOCKET_PATH)
  }
})

describe('Unix socket path handling', () => {
  it('correctly passes through HTTP GET requests to unix socket', async () => {
    const response = await makeRequest({
      socketPath: HTTP_SOCKET_PATH,
      path: '/test-get',
      method: 'GET',
      headers: {
        'X-Custom-Header': 'custom-value',
      },
    })

    expect(response.method).toBe('GET')
    expect(response.path).toBe('/test-get')
    expect(response.headers['x-custom-header']).toBe('custom-value')
  })

  it('correctly passes through HTTP POST requests with body to unix socket', async () => {
    const requestBody = JSON.stringify({ key: 'value' })

    const response = await makeRequest(
      {
        socketPath: HTTP_SOCKET_PATH,
        path: '/test-post',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody).toString(),
        },
      },
      requestBody
    )

    expect(response.method).toBe('POST')
    expect(response.path).toBe('/test-post')
    expect(response.body).toBe(requestBody)
    expect(response.headers['content-type']).toBe('application/json')
  })

  it('handles socket connection errors gracefully', async () => {
    try {
      await makeRequest({
        socketPath: NONEXISTENT_SOCKET_PATH,
        path: '/test-error',
        method: 'GET',
      })
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeTruthy()
      expect((error as Error).message).toContain('connect')
    }
  })
})

// Helper to make HTTP requests
function makeRequest(
  options: http.RequestOptions,
  body: string | null = null
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = ''
      res.on('data', (chunk) => {
        responseData += chunk.toString()
      })
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData)
          resolve(parsedData)
        } catch (e) {
          resolve(responseData)
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}
