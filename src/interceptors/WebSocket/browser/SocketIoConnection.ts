import { Packet, PacketType, Decoder, Encoder } from 'socket.io-parser'
import { decodePacket } from 'engine.io-parser'
import { WebSocketConnection } from './WebSocketConnection'
import type {
  WebSoketOverrideInstance,
  WebSocketMessageData,
} from './WebSocketOverride'
import { uuidv4 } from '../../../utils/uuid'
import { createEvent } from '../utils/createEvent'

/**
 * @see {@link node_modules/engine.io-parser/build/esm/commons.js}
 */
export enum EnginesIoParserPacketTypes {
  OPEN = '0',
  CLOSE = '1',
  PING = '2',
  PONG = '3',
  MESSAGE = '4',
  UPGRADE = '5',
  NOOP = '6',
}

export class SocketIoConnection extends WebSocketConnection {
  private encoder: Encoder
  private decoder: Decoder

  constructor(socket: WebSoketOverrideInstance) {
    super(socket)

    this.encoder = new Encoder()
    this.decoder = new Decoder()

    // Establish the decoder handler once.
    this.decoder.on('decoded', this.handleDecodedPacket.bind(this))

    this.socket.addEventListener('open', () => {
      this.connect()
    })
  }

  /**
   * Emulate the routine "socket.io-client" executes to confirm
   * a successful server connection.
   */
  private connect(): void {
    const sid = uuidv4()
    const pingInterval = 25000000

    // First, emulate that this client receives the "OPEN" event from the server.
    // This lets "socket.io-client" know that the server connection is established.
    this.socket.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.socket,
        data:
          EnginesIoParserPacketTypes.OPEN +
          JSON.stringify({
            sid,
            upgrades: [],
            pingInterval,
            pingTimeout: 6000000,
          }),
      })
    )

    // Next, emulate that the server has confirmed a new client.
    this.socket.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.socket,
        data:
          EnginesIoParserPacketTypes.MESSAGE +
          EnginesIoParserPacketTypes.OPEN +
          JSON.stringify({
            sid,
          }),
      })
    )

    // Then, emulate the client receiving the "PING" event from the server.
    // This keeps the connection alive, as "socket.io-client" sends "PONG" in response.
    const pingTimer = setInterval(() => {
      this.socket.dispatchEvent(
        createEvent(MessageEvent, 'message', {
          target: this.socket,
          // node_modules/engine.io-parser/build/esm/commons.js
          data: EnginesIoParserPacketTypes.PING,
        })
      )
    }, pingInterval)

    const clearPingTimer = () => {
      clearInterval(pingTimer)
    }

    // Clear the ping/poing internal if the socket terminates.
    this.socket.addEventListener('error', clearPingTimer)
    this.socket.addEventListener('error', clearPingTimer)
  }

  /**
   * Decode all outgoing "message" socket events.
   * Prevent them from routing to the connection emitter as-is,
   * as the "socket.io" messages must be decoded first.
   */
  protected handleOutgoingMessage(event: MessageEvent<WebSocketMessageData>) {
    const packet = decodePacket(event.data, this.socket.binaryType)

    if (packet.data) {
      // Actual event emitting is delegated to the decoder callback.
      this.decoder.add(packet.data)
    }
  }

  /**
   * Decode outgoing client messages of the "2<data>" format.
   */
  private handleDecodedPacket(packet: Packet): void {
    // Ignore reserved events like "PING" from propagating
    // to the user-facing "connection".
    if (packet.type !== PacketType.EVENT) {
      return
    }

    // The fist argument in the emitted message is always the event name.
    // - prepended "message" when using "socket.send()".
    // - custom event when using "socket.emit()".
    const data: [string, ...any] = packet.data || ['message']

    this.emitter.emit(...data)
  }

  public emit(eventName: string, ...data: any[]) {
    const packet: Packet = {
      type: Number(`${EnginesIoParserPacketTypes.MESSAGE}${PacketType.EVENT}`),
      data: [eventName, ...data],
      /**
       * @todo Is this safe to hard-code?
       */
      nsp: '/',
    }

    const encodedPackets = this.encoder.encode(packet)

    for (const encodedPacket of encodedPackets) {
      this.socket.dispatchEvent(
        createEvent(MessageEvent, 'message', {
          target: this.socket,
          data: encodedPacket,
        })
      )
    }
  }

  public send(data: WebSocketMessageData): void {
    // Calling "socket.send" is equivalent to emitting the "message" event.
    this.emit('message', data)
  }

  protected close() {
    // Destroy the decoder when the connection is closed.
    this.decoder.destroy()

    return super.close()
  }
}
