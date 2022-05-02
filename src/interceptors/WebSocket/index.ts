import type { WebSocketEventMap } from '../../glossary'
import type { Interceptor } from '../../Interceptor'
import { BatchInterceptor } from '../../BatchInterceptor'
import { ClientRequestInterceptor } from '../ClientRequest'
import { WebSocketPollingInterceptor } from './WebSocketPollingInterceptor'

const interceptors: Interceptor<WebSocketEventMap>[] = [
  new WebSocketPollingInterceptor({
    using: new ClientRequestInterceptor(),
  }),
]

export class WebSocketInterceptor extends BatchInterceptor<
  typeof interceptors
> {
  constructor() {
    super({
      name: 'websocket-interceptor',
      interceptors,
    })
  }
}
