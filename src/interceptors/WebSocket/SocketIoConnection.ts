import { Packet, PacketType, Decoder, Encoder } from 'socket.io-parser'
import { decodePacket } from 'engine.io-parser'
import type { WebSocketMessageData } from './WebSocketOverride'
import type { Transport } from './transports/WebSocketTransport'
import { Connection } from './Connection'

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

export interface SocketIoConnectionOptions {
  transport: Transport
}

export function createHandshakeResponse(
  sessionId: string,
  pingInterval: number
): string {
  return (
    EnginesIoParserPacketTypes.OPEN +
    JSON.stringify({
      sid: sessionId,
      upgrades: [],
      pingInterval,
      pingTimeout: 60000,
    })
  )
}

export function createOpenResponse(sessionId: string): string {
  return (
    EnginesIoParserPacketTypes.MESSAGE +
    EnginesIoParserPacketTypes.OPEN +
    JSON.stringify({
      sid: sessionId,
    })
  )
}

export function createPingResponse(): string {
  return EnginesIoParserPacketTypes.PING
}

/**
 * SocketIO connection encodes and decodes outgoing/incoming traffic
 * but delegates the actual data transfer to the given transport.
 */
export class SocketIoConnection extends Connection {
  private encoder: Encoder
  private decoder: Decoder

  constructor(options: SocketIoConnectionOptions) {
    super({
      transport: options.transport,
    })

    this.encoder = new Encoder()
    this.decoder = new Decoder()
    this.decoder.on('decoded', this.handleDecodedPacket.bind(this))
  }

  public send(data: WebSocketMessageData): void {
    this.emit('message', data)
  }

  public emit(event: string, ...data: unknown[]): void {
    const packet: Packet = {
      type: Number(`${EnginesIoParserPacketTypes.MESSAGE}${PacketType.EVENT}`),
      data: [event, ...data],
      /**
       * @todo Is this safe to hard-code?
       */
      nsp: '/',
    }

    const encodedPackets = this.encoder.encode(packet)
    for (const encodedPacket of encodedPackets) {
      this.transport.send(encodedPacket)
    }
  }

  protected onMessage(event: MessageEvent<WebSocketMessageData>): void {
    const packet = decodePacket(event.data, 'arraybuffer')

    if (!packet.data) {
      return
    }

    // Actual event emitting is delegated to the decoder callback.
    this.decoder.add(packet.data)
  }

  private handleDecodedPacket(packet: Packet): void {
    // Ignore "socket.io" internal events like "PING"
    // so they don't propagate to the user-facing connection.
    if (packet.type !== PacketType.EVENT) {
      return
    }

    const data: [string, ...unknown[]] = packet.data || ['message']
    this.emitter.emit(...data)
  }
}
