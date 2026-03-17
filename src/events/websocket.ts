import { TypedEvent } from 'rettime'
import type {
  WebSocketClientConnection,
  WebSocketServerConnection,
} from '../interceptors/WebSocket'

/**
 * The connection information.
 */
interface WebSocketConnectionInfo {
  /**
   * The protocols supported by the WebSocket client.
   */
  protocols: string | Array<string> | undefined
}

interface WebSocketConnectionEventData {
  /**
   * The incoming WebSocket client connection.
   */
  client: WebSocketClientConnection
  /**
   * The original WebSocket server connection.
   */
  server: WebSocketServerConnection
  info: WebSocketConnectionInfo
}

export class WebSocketConnectionEvent<
  DataType extends WebSocketConnectionEventData = WebSocketConnectionEventData,
> extends TypedEvent<DataType, void, 'connection'> {
  public client: WebSocketClientConnection
  public server: WebSocketServerConnection
  public info: WebSocketConnectionInfo

  constructor(data: DataType) {
    super(...(['connection', {}] as any))

    this.client = data.client
    this.server = data.server
    this.info = data.info
  }
}

export type WebSocketEventMap = {
  connection: WebSocketConnectionEvent
}
