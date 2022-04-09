import { uuidv4 } from '../../../utils/uuid'
import {
  createHandshakeResponse,
  createOpenResponse,
  createPingResponse,
} from '../SocketIoConnection'
import { WebSocketTransport } from './WebSocketTransport'

export class SocketIoWebSocketTransport extends WebSocketTransport {
  public open(): void {
    const sessionId = uuidv4()
    const pingInterval = 25000

    // Emulate handshake response from the server.
    this.send(createHandshakeResponse(sessionId, pingInterval))

    // Emulate connection open response from the server.
    this.send(createOpenResponse(sessionId))

    // Emulate ping/pong between the client and the server.
    const pingTimer = setInterval(() => {
      this.send(createPingResponse())
    }, pingInterval)

    const clearPingTimer = () => {
      clearInterval(pingTimer)
    }

    this.socket.addEventListener('error', clearPingTimer)
    this.socket.addEventListener('close', clearPingTimer)
  }
}
