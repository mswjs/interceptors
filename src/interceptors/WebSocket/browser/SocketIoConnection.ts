import { Packet, PacketType, Decoder, Encoder } from 'socket.io-parser'
import { decodePacket } from 'engine.io-parser'
import {
  WebSocketConnection,
  WebSocketConnectionEventsMap,
} from './WebSocketConnection'
import type { WebSocketMessageData } from './WebSocketOverride'
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
  private encoder: Encoder = new Encoder()
  private decoder: Decoder = new Decoder()

  constructor(client: WebSocket) {
    super(client)

    // Establish the decoder handler once.
    this.decoder.on('decoded', this.handleDecodedPacket.bind(this))

    this.client.addEventListener('open', () => {
      this.connect()
    })
  }

  /**
   * Emulate the routine "socket.io-client" executes to confirm
   * a successful server connection.
   */
  private connect(): void {
    const sid = uuidv4()
    const pingInterval = 25000

    // First, emulate that this client receives the "OPEN" event from the server.
    // This lets "socket.io-client" know that the server connection is established.
    this.client.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.client,
        data:
          EnginesIoParserPacketTypes.OPEN +
          JSON.stringify({
            sid,
            upgrades: [],
            pingInterval,
            pingTimeout: 60000,
          }),
      })
    )

    // Next, emulate that the server has confirmed a new client.
    this.client.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.client,
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
      this.client.dispatchEvent(
        createEvent(MessageEvent, 'message', {
          target: this.client,
          // node_modules/engine.io-parser/build/esm/commons.js
          data: EnginesIoParserPacketTypes.PING,
        })
      )
    }, pingInterval)

    const clearPingTimer = () => {
      clearInterval(pingTimer)
    }

    // Clear the ping/poing internal if the socket terminates.
    this.client.addEventListener('error', clearPingTimer)
    this.client.addEventListener('error', clearPingTimer)
  }

  /**
   * Decode outgoing client messages of the "2<data>" format.
   */
  private handleDecodedPacket(packet: Packet) {
    // Ignore reserved events like "PING" from propagating
    // to the user-facing "connection".
    if (packet.type !== PacketType.EVENT) {
      return
    }

    // The fist argument in the emitted message is always the event name.
    // - prepended "message" when using "socket.send()".
    // - custom event when using "socket.emit()".
    const data: [string, ...any] = packet.data || ['message']

    return super.emit<any>(...data)
  }

  emit<EventName extends keyof WebSocketConnectionEventsMap>(
    eventName: EventName,
    ...data: Parameters<WebSocketConnectionEventsMap[EventName]>
  ) {
    const [event] = data

    // Bypass non-message events like "close".
    // Those do not transfer data so don't need decoding.
    if (!(event instanceof MessageEvent)) {
      return super.emit(eventName, ...data)
    }

    // The data gets encoded twice:
    // - First by the "engine.io-client" (prepends "2" as in "MESSAGE" packet type).
    // - Then by "websocket" transport in "engine.io-parser" (prepends "4").
    // This step decodes "4" into a "2<data>" message format.
    const packet = decodePacket(event.data, this.client.binaryType)

    // Some reserved events (like "PING") do not send any data.
    if (packet.data) {
      this.decoder.add(packet.data)
    }

    return this.emitter.listenerCount(eventName) > 0
  }

  send(data: WebSocketMessageData): void {
    const packet: Packet = {
      type: Number(`${EnginesIoParserPacketTypes.MESSAGE}${PacketType.EVENT}`),
      // Calling "socket.send" is equivalent to emitting the "message" event.
      data: ['message', data],
      /**
       * @todo Is this safe to hard-code?
       */
      nsp: '/',
    }

    const encodedPackets = this.encoder.encode(packet)

    for (const encodedPacket of encodedPackets) {
      this.client.dispatchEvent(
        createEvent(MessageEvent, 'message', {
          target: this.client,
          data: encodedPacket,
        })
      )
    }
  }

  close() {
    // Destroy the decoder when the connection is closed.
    this.decoder.destroy()

    return super.close()
  }
}
