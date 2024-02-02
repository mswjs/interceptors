import { encodePayload, decodePayload } from 'engine.io-parser'
import {
  Encoder,
  Decoder,
  PacketType as SocketIoPacketType,
} from 'socket.io-parser'
import type { WebSocketClientConnection } from './WebSocketClientConnection'
import type { WebSocketServerConnection } from './WebSocketServerConnection'
import type { WebSocketRawData } from './WebSocketTransport'

const encoder = new Encoder()
const decoder = new Decoder()

class SocketIoConnection {
  constructor(
    private readonly connection:
      | WebSocketClientConnection
      | WebSocketServerConnection
  ) {}

  public on(
    event: string,
    listener: (...data: Array<WebSocketRawData>) => void
  ): void {
    this.connection.on('message', (message) => {
      const engineIoPackets = decodePayload(
        message.data,
        /**
         * @fixme Grab the binary type from somewhere.
         * Can try grabbing it from the WebSocket
         * instance but we can't reference it here.
         */
        'blob'
      )

      /**
       * @todo Check if this works correctly with
       * Blob and ArrayBuffer data.
       */
      if (engineIoPackets.every((packet) => packet.type !== 'message')) {
        return
      }

      /**
       * @fixme This is a potential listener leak.
       * Remove the listener once the data is
       * finished receiving.
       */
      decoder.on('decoded', (decodedSocketIoPacket) => {
        if (decodedSocketIoPacket.type !== SocketIoPacketType.EVENT) {
          return
        }

        const [sentEvent, ...data] = decodedSocketIoPacket.data

        if (sentEvent === event) {
          listener(...data)
        }
      })

      for (const packet of engineIoPackets) {
        decoder.add(packet)
      }
    })
  }

  public send(...data: Array<WebSocketRawData>): void {
    this.emit('message', ...data)
  }

  public emit(event: string, ...data: Array<WebSocketRawData>): void {
    /**
     * @todo Check if this correctly encodes Blob
     * and ArrayBuffer data.
     */
    const encodedSocketIoPacket = encoder.encode({
      type: SocketIoPacketType.EVENT,
      /**
       * @todo Support custom namespaces.
       */
      nsp: '/',
      data: [event, ...data],
    })

    // Encode the payload in multiple sends
    // because Socket.IO represents Blob/Buffer
    // data with 2 "message" events dispatched.
    encodePayload(encodedSocketIoPacket, (encodedPayload) => {
      this.connection.send(encodedPayload)
    })
  }
}

/**
 * @example
 * interceptor.on('connection', (args) => {
 *   const client = io(args.client)
 *   client.on('hello', (firstName) => {
 *     client.emit('greetings', `Hello, ${firstName}!`)
 *   })
 * })
 */
export function io(
  connection: WebSocketClientConnection | WebSocketServerConnection
) {
  return new SocketIoConnection(connection)
}
