import { TypedEvent } from 'rettime'
import type {
  WebSocketData,
  WebSocketClientHandle,
  WebSocketClientConnection,
  WebSocketServerHandle,
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

/**
 * An intercepted WebSocket connection: the client and the server handles.
 *
 * @note Typed against the handles, not the connection classes,
 * so that a connection living anywhere (in this process, in another
 * runtime, or in a custom implementation) can be given to whoever
 * consumes intercepted connections (e.g. a handler).
 */
export interface WebSocketConnectionEventData<Message = WebSocketData> {
  /**
   * The incoming WebSocket client connection.
   */
  client: WebSocketClientHandle<Message>
  /**
   * The original WebSocket server connection.
   */
  server: WebSocketServerHandle<Message>
  info: WebSocketConnectionInfo
}

/**
 * The connection intercepted by the `WebSocketInterceptor`:
 * both the client and the server live in this process.
 */
export interface WebSocketInterceptedConnection<
  Message = WebSocketData,
> extends WebSocketConnectionEventData<Message> {
  client: WebSocketClientConnection<Message>
  server: WebSocketServerConnection<Message>
}

export class WebSocketConnectionEvent<Message = WebSocketData>
  extends TypedEvent<
    WebSocketInterceptedConnection<Message>,
    void,
    'connection'
  >
  implements WebSocketInterceptedConnection<Message>
{
  public client: WebSocketClientConnection<Message>
  public server: WebSocketServerConnection<Message>
  public info: WebSocketConnectionInfo

  constructor(data: WebSocketInterceptedConnection<Message>) {
    super('connection', { data })

    this.client = data.client
    this.server = data.server
    this.info = data.info
  }
}

export type WebSocketEventMap<Message = WebSocketData, Extension = {}> = {
  connection: WebSocketConnectionEvent<Message> & Extension
}
