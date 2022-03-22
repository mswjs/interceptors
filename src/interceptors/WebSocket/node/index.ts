import { Interceptor } from '../../../createInterceptor'

const interceptWebSocketNode: Interceptor<'websocket'> = () => {
  throw new Error('Not Implemented')
}

export default interceptWebSocketNode
