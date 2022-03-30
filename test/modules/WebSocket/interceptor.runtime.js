import { createInterceptor } from '@mswjs/interceptors'
import { interceptWebSocket } from '@mswjs/interceptors/lib/interceptors/WebSocket'

const interceptor = createInterceptor({
  modules: [interceptWebSocket],
  resolver(event) {
    window.resolver(event)
  },
})

interceptor.apply()
