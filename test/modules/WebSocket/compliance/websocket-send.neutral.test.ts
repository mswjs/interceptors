/**
 * @see https://websockets.spec.whatwg.org/#dom-websocket-send
 */
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('throws "InvalidStateError" when sending while the connection is not open yet', () => {
  const ws = new WebSocket('wss://example.com')
  expect(() => ws.send('hello')).toThrow('InvalidStateError')
})

it('sends data to the original server immediately after connecting', async () => {
  const messagePromise = Promise.withResolvers<string>()

  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.send('hello from interceptor')
  })

  // The actual server echoes the received messages.
  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => messagePromise.resolve(event.data)

  await expect(messagePromise.promise).resolves.toBe('hello from interceptor')
  ws.close()
})

it('sends text data to the original server', async () => {
  const messagePromise = Promise.withResolvers<string>()

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.onmessage = (event) => messagePromise.resolve(event.data)
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send('hello')
    expect(ws.bufferedAmount).toBe(5)
  })

  await expect(messagePromise.promise).resolves.toBe('hello')
  expect(ws.bufferedAmount).toBe(0)
  ws.close()
})

it('sends Blob data to the original server', async () => {
  const messagePromise = Promise.withResolvers<ArrayBuffer>()

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (event) => messagePromise.resolve(event.data)
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send(new Blob(['hello']))
    expect(ws.bufferedAmount).toBe(5)
  })

  const echoedData = await messagePromise.promise
  expect(new TextDecoder().decode(echoedData)).toBe('hello')
  expect(ws.bufferedAmount).toBe(0)
  ws.close()
})

it('sends ArrayBuffer data to the original server', async () => {
  const messagePromise = Promise.withResolvers<ArrayBuffer>()

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(server.ws.url('/?echo'))
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (event) => messagePromise.resolve(event.data)
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send(new TextEncoder().encode('hello'))
    expect(ws.bufferedAmount).toBe(5)
  })

  const echoedData = await messagePromise.promise
  expect(new TextDecoder().decode(echoedData)).toBe('hello')
  expect(ws.bufferedAmount).toBe(0)
  ws.close()
})
