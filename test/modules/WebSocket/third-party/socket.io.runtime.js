import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { Encoder, Decoder } from 'socket.io-parser'
import { encodePacket, decodePacket } from 'engine.io-parser'

const interceptor = new WebSocketInterceptor()
interceptor.apply()
window.interceptor = interceptor

window.encodePacket = encodePacket
window.decodePacket = decodePacket
window.encoder = new Encoder()
window.decoder = new Decoder()
