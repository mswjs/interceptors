import { StrictEventEmitter } from 'strict-event-emitter'
import { Packet, PacketType, Decoder } from 'socket.io-parser'
import { decodePacket } from 'engine.io-parser'

export class SocketIOTransport extends StrictEventEmitter<any> {
  constructor(private readonly socket: WebSocket) {
    super()

    /**
     * @todo Add a listener to a new "open" event and move the socket.io
     * handshake logic here.
     */
  }

  emit(event: any, message: MessageEvent): boolean {
    // The data gets encoded twice:
    // - First by the engine (prepends "2" as in "MESSAGE" packet type).
    // - Then by "websocket" transport in "engine.io-parser" (prepends "4" ).
    // This step decodes "4" into message.
    const packet = decodePacket(message.data, this.socket.binaryType)

    const decoder = new Decoder()

    // This decoder handles "2<data>" message formats.
    decoder.on('decoded', (packet: Packet) => {
      // Ignore reserved events like "PING" from propagating
      // to the user-facing "connection".
      if (packet.type !== PacketType.EVENT) {
        return
      }

      // The fist argument in the emitted message is always the event name.
      // - prepended "message" when using "socket.send()".
      // - custom event when using "socket.emit()".
      const data: [string, ...any] = packet.data || ['message']
      super.emit(...data)
    })

    // Some reserved events (like "PING") do not send any data.
    if (packet.data) {
      decoder.add(packet.data)
    }

    return super.listenerCount(event) > 0
  }
}
