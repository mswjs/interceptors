import { Packet, PacketType, Decoder, Encoder } from 'socket.io-parser'
import { decodePacket } from 'engine.io-parser'
import {
  WebSocketConnection,
  WebSocketConnectionEventsMap,
} from './WebSocketConnection'
import type { WebSocketMessageData } from './WebSocketOverride'

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

  constructor(client: any) {
    super(client)

    // Establish the decoder handler once.
    this.decoder.on('decoded', this.handleDecodedPacket.bind(this))
  }

  /**
   * Decode outgoing client messages of the "2<data>" format.
   */
  handleDecodedPacket(packet: Packet) {
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
      this.client.emitter.emit(
        'message',
        new MessageEvent('message', {
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
