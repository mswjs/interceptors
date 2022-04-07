import { WebSocketInterceptor } from '@mswjs/interceptors/lib/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()
interceptor.apply()

// Each individual test decides how to handle
// incoming socket connections.
window.interceptor = interceptor
