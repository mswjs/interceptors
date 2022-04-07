import { parseWebSocketProtocols } from './parseWebSocketProtocols'

it('parses given websocket protocols', () => {
  expect(parseWebSocketProtocols(['wss', 'ws'])).toEqual(['wss', 'ws'])
})

it('throws error given invalid protocol value', () => {
  expect(() =>
    parseWebSocketProtocols(
      // @ts-expect-error Purposefully invalid protocol.
      32
    )
  ).toThrow(
    `Syntax Error: Failed to construct 'WebSocket': The subprotocol '32' is invalid.`
  )
})

it('throws error given protocols array with duplicate values', () => {
  expect(() => parseWebSocketProtocols(['wss', 'wss'])).toThrow(
    `Syntax Error: Failed to construct 'WebSocket': The subprotocol 'wss' is duplicated.`
  )
})
