import { isNodeProcess } from 'is-node-process'
import { Interceptor } from '../../createInterceptor'

export const interceptWebSocket: Interceptor<'websocket'> = isNodeProcess()
  ? require('./node').default
  : require('./browser').default
