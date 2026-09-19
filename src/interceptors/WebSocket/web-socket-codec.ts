import type { WebSocketData } from './web-socket-transport'
import type { WebSocketClientConnection } from './web-socket-client-connection'
import type { WebSocketServerConnection } from './web-socket-server-connection'

/**
 * The result of a codec method: a single value, an iterator
 * over multiple values, or `undefined` for no values at all.
 *
 * @note Only iterators (objects with a `next()` method, like generators)
 * are unfolded. Iterables that are not iterators, like strings, arrays,
 * or typed arrays, are treated as a single value so array-shaped
 * messages remain unambiguous.
 */
export type WebSocketCodecResult<Value> =
  | Value
  | Iterator<Value, Value | void>
  | undefined

/**
 * A codec transforms the data at the boundary between the connection
 * objects (`client`, `server`) and the raw WebSocket frames.
 * The connection decides *when* to encode/decode (before sending,
 * before dispatching an outgoing/incoming frame as a `message` event);
 * the codec decides *how*.
 *
 * Codecs are invisible to the connection consumer: `client.send()`,
 * `server.send()`, and the `message` events all operate on decoded data.
 * Raw frames forwarded between the client and the original server
 * (passthrough) are never encoded or decoded.
 *
 * A codec method returns a single value for a one-to-one mapping,
 * an iterator (e.g. a generator) to unfold one input into many,
 * or nothing to drop the input.
 *
 * @example
 * const codec = defineWebSocketCodec<string>({
 *   encode: (data) => data.toUpperCase(),
 *   decode: (data) => (typeof data === 'string' ? data.toLowerCase() : undefined),
 * })
 *
 * interceptor.on('connection', ({ client, server }) => {
 *   client.codec = codec
 *   server.codec = codec
 * })
 */
export interface WebSocketCodec<Message = WebSocketData> {
  /**
   * Encode the given message into the raw frame(s) to send to the peer.
   */
  encode(
    message: Message,
    connection: WebSocketClientConnection | WebSocketServerConnection
  ): WebSocketCodecResult<WebSocketData>

  /**
   * Decode the given raw frame into the message(s) to dispatch
   * as `message` events. Return nothing to swallow the frame
   * (e.g. protocol control packets).
   */
  decode(
    data: WebSocketData,
    connection: WebSocketClientConnection | WebSocketServerConnection
  ): WebSocketCodecResult<Message>

  /**
   * Called once the mock connection to the client is open and
   * no connection to the original server was established.
   * Use this to emit session frames on behalf of the server
   * (e.g. a protocol handshake or a heartbeat).
   */
  open?(
    connection: WebSocketClientConnection,
    send: (data: WebSocketData) => void
  ): void

  /**
   * Called once the connection is closed. Use this to dispose
   * of any per-connection state.
   */
  close?(
    connection: WebSocketClientConnection | WebSocketServerConnection
  ): void
}

/**
 * Define a WebSocket codec.
 *
 * This is an identity function that helps declaring codecs
 * with the correct message type inferred from the codec itself.
 */
export function defineWebSocketCodec<Message = WebSocketData>(
  codec: WebSocketCodec<Message>
): WebSocketCodec<Message> {
  return codec
}

/**
 * Iterate over the values of the given codec result.
 * A generator's return value, if any, counts as its last value.
 *
 * Delegating via `yield*` forwards early termination of this
 * generator (e.g. a `break` or an error in the consumer's loop)
 * to the underlying iterator so it can clean up after itself.
 */
export function* iterateWebSocketCodecResult<Value>(
  result: WebSocketCodecResult<Value>
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
