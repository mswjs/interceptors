import '../websocket.runtime'
// Require "socket.io" after the interceptor because
// "socket.io" hoists the reference to "window.WebSocket"
// at the moment of import.
import io from 'socket.io-client'

window.io = io
