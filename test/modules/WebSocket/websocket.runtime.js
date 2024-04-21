import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'

window.interceptor = new WebSocketInterceptor()
window.outgoingData = []
