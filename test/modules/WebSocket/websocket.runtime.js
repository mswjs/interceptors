import { createInterceptor } from '@mswjs/interceptors'
import { interceptWebSocket } from '@mswjs/interceptors/lib/interceptors/WebSocket'

const interceptor = createInterceptor({
  modules: [interceptWebSocket],
  resolver(event) {
    window.connections.push(event.connection)

    // Send a message to the connected client.
    // connection.send('what a lovely day!')

    // Listen to the incoming message from the client.
    // connection.on('message', (event) => {
    //   console.log(event.data)

    // Respond on demand.
    // connection.send('hello to you too!')
    // })

    // Listen to the client closing.
    // connection.on('close', (event) => {
    //   console.log('> client closed', event)
    // })
  },
})

interceptor.apply()

// Require "socket.io" after the interceptor so it hoists
// the overridden WebSocket constructor.
window.sockets = []
window.connections = []

async function assignSocketIO() {
  const socketIO = await import('socket.io-client')
  window.io = socketIO.default
}
assignSocketIO()
