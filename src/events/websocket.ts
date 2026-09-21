import { TypedEvent } from 'rettime'
import type {
  WebSocketData,
  WebSocketClientConnection,
  WebSocketServerConnection,
} from '../interceptors/WebSocket'

/**
 * The connection information.
 */
export interface WebSocketConnectionInfo {
  /**
   * The protocols supported by the WebSocket client.
   */
  protocols: string | Array<string> | undefined
}

export interface WebSocketConnectionEventData<Message = WebSocketData> {
  /**
   * The incoming WebSocket client connection.
   */
  client: WebSocketClientConnection<Message>
  /**
   * The original WebSocket server connection.
   */
  server: WebSocketServerConnection<Message>
  info: WebSocketConnectionInfo
}

export class WebSocketConnectionEvent<
  Message = WebSocketData,
> extends TypedEvent<
  WebSocketConnectionEventData<Message>,
  void,
  'connection'
> {
  public client: WebSocketClientConnection<Message>
  public server: WebSocketServerConnection<Message>
  public info: WebSocketConnectionInfo

  constructor(data: WebSocketConnectionEventData<Message>) {
    super('connection', { data })

    this.client = data.client
    this.server = data.server
    this.info = data.info
  }
}

export type WebSocketEventMap<Message = WebSocketData, Extension = {}> = {
  connection: WebSocketConnectionEvent<Message> & Extension
}
