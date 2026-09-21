import type { WebSocketData } from './web-socket-transport'
import type { WebSocketClientConnection } from './web-socket-client-connection'
import type { WebSocketServerConnection } from './web-socket-server-connection'
import type { WebSocketConnectionInfo } from '../../events/websocket'

export const kProtocolContext = Symbol('kProtocolContext')

/**
 * The result of a protocol method: a single value, an iterator
 * over multiple values, or `undefined` for no values at all.
 *
 * @note Only iterators (objects with a `next()` method, like generators)
 * are unfolded. Iterables that are not iterators, like strings, arrays,
 * or typed arrays, are treated as a single value so array-shaped
 * messages remain unambiguous.
 */
export type WebSocketProtocolResult<Value> =
  Value | Iterator<Value, Value | void> | undefined

/**
 * The intercepted connection a protocol operates on.
 */
export interface WebSocketProtocolContext {
  client: WebSocketClientConnection
  server: WebSocketServerConnection
  info: WebSocketConnectionInfo
}

export interface WebSocketProtocolMessageContext extends WebSocketProtocolContext {
  /**
   * The connection whose data is being encoded or decoded:
   * the `client` for data crossing the client connection,
   * the `server` for data crossing the original server connection.
   */
  connection: WebSocketClientConnection | WebSocketServerConnection
}

/**
 * A protocol layered on top of WebSocket (e.g. Socket.IO).
 *
 * A protocol describes the message framing (`encode`/`decode`)
 * and what a server of that protocol says first (`handshake`).
 * The interceptor decides *when* each part applies: `send()` encodes,
 * frames are decoded before being dispatched as `message` events,
 * and the handshake is sent once a mocked connection opens.
 *
 * A protocol is invisible to the connection consumer: `client.send()`,
 * `server.send()`, and the `message` events all operate on decoded data.
 * Raw frames forwarded between the client and the original server
 * (passthrough) are never encoded or decoded.
 *
 * A method returns a single value for a one-to-one mapping,
 * an iterator (e.g. a generator) to unfold one input into many,
 * or nothing to drop the input.
 *
 * @example
 * class SocketIo extends WebSocketProtocol<string> {
 *   match({ client }) {
 *     return client.url.pathname.startsWith('/socket.io/')
 *   }
 *   encode(message) {
 *     return '42' + message
 *   }
 *   decode(data) {
 *     return typeof data === 'string' && data.startsWith('42') ? data.slice(2) : undefined
 *   }
 *   *handshake() {
 *     yield '0{"sid":"test","upgrades":[],"pingInterval":25000,"pingTimeout":5000}'
 *     yield '40{"sid":"test"}'
 *   }
 * }
 *
 * new WebSocketInterceptor({ protocols: [new SocketIo()] })
 */
export abstract class WebSocketProtocol<Message = WebSocketData> {
  /**
   * Whether this protocol applies to the given connection.
   * Consulted by the interceptor for every intercepted connection.
   */
  public match?(context: WebSocketProtocolContext): boolean

  /**
   * Encode the given message into the raw frame(s) to send to the peer.
   */
  public abstract encode(
    message: Message,
    context: WebSocketProtocolMessageContext
  ): WebSocketProtocolResult<WebSocketData>

  /**
   * Decode the given raw frame into the message(s) to dispatch
   * as `message` events. Return nothing to swallow the frame
   * (e.g. protocol control packets).
   */
  public abstract decode(
    data: WebSocketData,
    context: WebSocketProtocolMessageContext
  ): WebSocketProtocolResult<Message>

  /**
   * The raw frame(s) a server of this protocol sends once
   * the connection is open (e.g. a session handshake).
   * Sent to the client by the interceptor when the mocked connection
   * opens, unless a connection to the original server was established,
   * in which case the original server sends its own handshake.
   */
  public handshake?(
    context: WebSocketProtocolContext
  ): WebSocketProtocolResult<WebSocketData>
}

/**
 * Iterate over the values of the given protocol result.
 * A generator's return value, if any, counts as its last value.
 *
 * Delegating via `yield*` forwards early termination of this
 * generator (e.g. a `break` or an error in the consumer's loop)
 * to the underlying iterator so it can clean up after itself.
 */
export function* iterateWebSocketProtocolResult<Value>(
  result: WebSocketProtocolResult<Value>
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
