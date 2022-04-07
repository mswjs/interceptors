import { parseWebSocketUrl } from './parseWebSocketUrl'

it('parses a websocket url', () => {
  expect(
    parseWebSocketUrl(
      'ws://example.com/socket.io/?EIO=3&transport=websocket'
    ).toString()
  ).toEqual('ws://example.com/socket.io/?EIO=3&transport=websocket')
})

it('throws error given url without a protocol', () => {
  expect(() => parseWebSocketUrl('example.com')).toThrow(
    `Syntax Error: Failed to construct 'WebSocket': The URL 'example.com' is invalid.`
  )
})

it('throws error given an unknown protocol', () => {
  expect(() => parseWebSocketUrl('foo://example.com')).toThrow(
    `Syntax Error: Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'. 'foo' is not allowed.`
  )
})

it('throws error given url with a hash', () => {
  expect(() => parseWebSocketUrl('ws://example.com#foo')).toThrow(
    `Syntax Error: Failed to construct 'WebSocket': The URL contains a fragment identifier ('foo'). Fragment identifiers are not allowed in WebSocket URLs.`
  )
})
