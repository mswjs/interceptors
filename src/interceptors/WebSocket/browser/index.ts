import { Interceptor } from '../../../createInterceptor'
import { createWebSocketOverride } from './WebSocketOverride'

const debug = require('debug')('ws:browser')

const interceptWebSocketBrowser: Interceptor<'websocket'> = (
  _observer,
  resolver
) => {
  const pureWebSocket = window.WebSocket

  debug('replacing "window.WebSocket"...')
  const WebSocketOverride = createWebSocketOverride({
    resolver,
  })
  window.WebSocket = WebSocketOverride

  return () => {
    debug('restoring "window.WebSocket"...')
    window.WebSocket = pureWebSocket
  }
}

export default interceptWebSocketBrowser
