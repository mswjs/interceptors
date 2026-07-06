import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { Encoder, Decoder, PacketType } from 'socket.io-parser'
import { encodePacket, decodePacket, type RawData } from 'engine.io-parser'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()
const encoder = new Encoder()
const decoder = new Decoder()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

function decodeMessage(encodedEngineIoPacket: RawData): Array<unknown> | undefined {
  const decodedEngineIoPacket = decodePacket(encodedEngineIoPacket)

  if (decodedEngineIoPacket.type !== 'message') {
    return
  }

  const decodedSocketIoPacket = decoder['decodeString'](
    decodedEngineIoPacket.data
  )

  if (decodedSocketIoPacket.type !== PacketType.EVENT) {
    return
  }

  return decodedSocketIoPacket.data.slice(1)
}

function encodeMessage(data: unknown): Promise<RawData> {
  return new Promise((resolve) => {
    encodePacket(
      {
        type: 'message',
        data: encoder.encode({
          type: PacketType.EVENT,
          data: ['message', data],
          nsp: '/',
        }),
      },
      true,
      (encodedEngineIoPacket) => {
        resolve(encodedEngineIoPacket)
      }
    )
  })
}

it('intercepts and modifies data sent to a socket.io server', async () => {
  interceptor.on('connection', ({ client, server }) => {
    server.connect()

    client.addEventListener('message', async (event) => {
      const data = decodeMessage(event.data)

      if (data?.[0] === 'hello') {
        event.preventDefault()
        server.send(await encodeMessage('mocked hello!'))
      }
    })
  })

  /**
   * @note Import "socket.io-client" after the interceptor is applied.
   * Socket.IO stores the reference to the global WebSocket class once
   * it's evaluated so it cannot be patched by the interceptor afterward.
   */
  const { io } = await import('socket.io-client')

  const echoedMessagePromise = new DeferredPromise<string>()
  const ws = io(server.io.href, {
    transports: ['websocket'],
  })

  // The Socket.IO test server echoes any received message.
  ws.on('message', (data) => {
    echoedMessagePromise.resolve(data)
  })
  ws.on('connect', () => {
    ws.send('hello')
  })

  await expect(echoedMessagePromise).resolves.toBe('mocked hello!')

  ws.close()
})
