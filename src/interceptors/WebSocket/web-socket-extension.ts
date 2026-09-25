import type { WebSocketData } from './web-socket-transport'
import type { WebSocketClientHandle } from './web-socket-client-connection'
import type { WebSocketServerHandle } from './web-socket-server-connection'
import type { WebSocketConnectionInfo } from '../../events/websocket'

export const kExtensionContext = Symbol('kExtensionContext')

/**
 * The messages the given extension encodes and decodes.
 *
 * @note Inferred from the `encode()` parameter alone. Inferring from the
 * whole class would also consider the return type of `decode()`, where a
 * `Generator<Message>` (whose return type defaults to `any`) would widen
 * the messages to `any`.
 */
export type WebSocketExtensionMessage<Extension> = Extension extends {
  encode(message: infer Message, context: never): unknown
}
  ? Message
  : never

/**
 * The API the given extension adds to the connection event.
 */
export type WebSocketExtensionApi<Extension> =
  Extension extends WebSocketExtension<unknown, infer Api> ? Api : never

/**
 * The result of an extension method: a single value, an iterator
 * over multiple values, or `undefined` for no values at all.
 *
 * @note Only iterators (objects with a `next()` method, like generators)
 * are unfolded. Iterables that are not iterators, like strings, arrays,
 * or typed arrays, are treated as a single value so array-shaped
 * messages remain unambiguous.
 */
export type WebSocketExtensionResult<Value> =
  Value | Iterator<Value, Value | void> | undefined

/**
 * The intercepted connection an extension operates on.
 */
export interface WebSocketExtensionContext<Message = WebSocketData> {
  client: WebSocketClientHandle<Message>
  server: WebSocketServerHandle<Message>
  info: WebSocketConnectionInfo
}

export interface WebSocketExtensionMessageContext<
  Message = WebSocketData,
> extends WebSocketExtensionContext<Message> {
  /**
   * The connection whose data is being encoded or decoded:
   * the `client` for data crossing the client connection,
   * the `server` for data crossing the original server connection.
   */
  connection: WebSocketClientHandle<Message> | WebSocketServerHandle<Message>
}

/**
 * A WebSocket extension: the server-side implementation of a protocol layered on top of
 * WebSocket (e.g. Socket.IO): its message framing (`encode`/`decode`),
 * its session as spoken by a server endpoint (`connect`/`receive`),
 * and the server API it adds to every connection (`extend`).
 *
 * The interceptor decides *when* each part applies: `send()` encodes,
 * frames are decoded before being dispatched as `message` events,
 * `connect` and `receive` frames are sent while the mocked connection
 * plays the server, and the extension is exposed on the connection event.
 *
 * An extension is invisible to the connection consumer: `client.send()`,
 * `server.send()`, and the `message` events all operate on messages,
 * and the session frames never surface. Raw frames forwarded between
 * the client and the original server (passthrough) are never touched.
 *
 * A method returns a single value for a one-to-one mapping,
 * an iterator (e.g. a generator) to unfold one input into many,
 * or nothing to drop the input.
 *
 * @example
 * class SocketIo extends WebSocketExtension<SocketIoMessage, { rooms: Rooms }> {
 *   match({ client }) {
 *     return client.url.searchParams.has('EIO')
 *   }
 *   encode(message) { ... }
 *   decode(data) { ... }
 *   connect() { ... }
 *   receive(data) { ... }
 *   extend({ client }) {
 *     return { rooms: new Rooms(client) }
 *   }
 * }
 *
 * new WebSocketInterceptor({ extensions: [new SocketIo()] })
 */
export abstract class WebSocketExtension<
  Message = WebSocketData,
  Extension = {},
> {
  /**
   * Whether this extension applies to the given connection.
   * Allows applying the extension to a subset of intercepted connections.
   */
  public match?(context: WebSocketExtensionContext<Message>): boolean

  /**
   * Encode the given message into the raw frame(s) to send to the peer.
   */
  public abstract encode(
    message: Message,
    context: WebSocketExtensionMessageContext<Message>
  ): WebSocketExtensionResult<WebSocketData>

  /**
   * Decode the given raw frame into the message(s) to dispatch
   * as `message` events. Return nothing to swallow the frame
   * (e.g. protocol control frames).
   */
  public abstract decode(
    data: WebSocketData,
    context: WebSocketExtensionMessageContext<Message>
  ): WebSocketExtensionResult<Message>

  /**
   * The raw frame(s) a server of this extension's protocol sends once the
   * connection is established (e.g. a session handshake).
   * Sent to the client by the interceptor when the mocked connection
   * opens, unless a connection to the original server was established,
   * in which case the original server speaks for itself.
   */
  public connect?(
    context: WebSocketExtensionContext<Message>
  ): WebSocketExtensionResult<WebSocketData>

  /**
   * The raw frame(s) a server of this extension's protocol sends back in response
   * to the given client frame (e.g. a control frame acknowledgement),
   * the way a WebSocket endpoint answers a ping with a pong.
   * Applied by the interceptor under the same condition as `connect`.
   */
  public receive?(
    data: WebSocketData,
    context: WebSocketExtensionContext<Message>
  ): WebSocketExtensionResult<WebSocketData>

  /**
   * The server API this extension adds to the given connection
   * (e.g. rooms). Exposed on the connection event alongside
   * the `client` and the `server`.
   */
  public extend?(context: WebSocketExtensionContext<Message>): Extension

  /**
   * Apply this extension to the given connection.
   * From then on, both the client and the server of that connection
   * encode the data they send and decode the data they receive.
   */
  public apply(connection: {
    client: WebSocketClientHandle<Message>
    server: WebSocketServerHandle<Message>
  }): void {
    connection.client.extension = this
    connection.server.extension = this
  }
}

/**
 * Assert that the given message is raw WebSocket data.
 * Without a protocol, a connection can only carry raw data.
 */
export function toWebSocketData(message: unknown): WebSocketData {
  if (
    typeof message === 'string' ||
    message instanceof ArrayBuffer ||
    message instanceof Blob
  ) {
    return message
  }

  if (ArrayBuffer.isView(message) && message.buffer instanceof ArrayBuffer) {
    return new Uint8Array(
      message.buffer,
      message.byteOffset,
      message.byteLength
    )
  }

  throw new TypeError(
    `Failed to send a message of type "${typeof message}": a connection without an extension can only send strings, Blob, ArrayBuffer, or ArrayBufferView`
  )
}

/**
 * Iterate over the values of the given protocol result.
 * A generator's return value, if any, counts as its last value.
 *
 * Delegating via `yield*` forwards early termination of this
 * generator (e.g. a `break` or an error in the consumer's loop)
 * to the underlying iterator so it can clean up after itself.
 */
export function* iterateWebSocketExtensionResult<Value>(
  result: WebSocketExtensionResult<Value>
): Generator<Value, void, undefined> {
  if (result === undefined) {
    return
  }

  if (isIterator<Value>(result)) {
    const returnValue = yield* { [Symbol.iterator]: () => result }

    if (returnValue !== undefined) {
      yield returnValue
    }

    return
  }

  yield result
}

/**
 * @note Only objects with a `next()` method count as iterators.
 * Iterables that are not iterators (strings, arrays, typed arrays)
 * are intentionally excluded so array-shaped messages remain unambiguous.
 */
function isIterator<Value>(
  value: unknown
): value is Iterator<Value, Value | void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'next') === 'function'
  )
}
