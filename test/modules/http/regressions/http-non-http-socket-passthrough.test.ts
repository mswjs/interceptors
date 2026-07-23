// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/808
 */
import net from 'node:net'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { createRawTestServer } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.on('request', () => {})
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('passes a non-http socket through to the actual server', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((connection) => {
      connection.on('data', () => {
        connection.write('PONG')
      })
    })
  })

  const response = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(server.port, server.hostname)
    socket.on('connect', () => {
      socket.write('PING')
    })
    socket.on('data', (chunk) => {
      resolve(chunk.toString())
      socket.destroy()
    })
    socket.on('error', reject)
  })

  expect(response).toBe('PONG')
})
