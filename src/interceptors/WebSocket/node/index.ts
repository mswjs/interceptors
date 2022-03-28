import { Interceptor } from '../../../createInterceptor'

const interceptWebSocketNode: Interceptor<'websocket'> = (
  _observer,
  resolver
) => {
  console.log('interceptor applied')

  return () => {}
}

export default interceptWebSocketNode
