/**
 * @vitest-environment node
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import http from 'node:http'
import net, { AddressInfo } from 'node:net'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const largeResponseBody = Buffer.alloc(1024 * 1024, 'a')
const interceptor = new ClientRequestInterceptor()

const rawHttpServer = net.createServer((socket) => {
  socket.once('data', () => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Connection: close\r\n')
    // Use conventional response framing. The regression is caused by the
    // large response body and delayed consumption, not by this header.
    socket.write(`Content-Length: ${largeResponseBody.byteLength}\r\n`)
    socket.write('Content-Type: text/plain\r\n')
    socket.write('\r\n')
    socket.end(largeResponseBody)
  })
})

beforeAll(async () => {
  interceptor.apply()
  await new Promise<void>((resolve) => {
    rawHttpServer.listen(0, '127.0.0.1', resolve)
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await new Promise<void>((resolve, reject) => {
    rawHttpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
})

it('delivers a large passthrough response to a delayed consumer before closing', async () => {
  expect.assertions(2)

  const address = rawHttpServer.address() as AddressInfo
  const result = await new Promise<{
    receivedBodySize: number
    isComplete: boolean
  }>((resolve, reject) => {
    const request = http.get(
      `http://127.0.0.1:${address.port}/resource`,
      (response) => {
        let bytesRead = 0

        response.on('error', reject)

        // Delay response consumption by one tick so the original socket close
        // can race with this passthrough socket's readable completion.
        response.pause()

        setImmediate(() => {
          response.on('data', (chunk: Buffer) => {
            bytesRead += chunk.byteLength
          })
          response.on('end', () => {
            resolve({
              receivedBodySize: bytesRead,
              isComplete: response.complete,
            })
          })
          response.resume()
        })
      }
    )

    request.on('error', reject)
  })

  expect(result.receivedBodySize).toBe(largeResponseBody.byteLength)
  expect(result.isComplete).toBe(true)
})
