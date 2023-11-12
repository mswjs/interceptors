import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()
window.interceptor = interceptor
