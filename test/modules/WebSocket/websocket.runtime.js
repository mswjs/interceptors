import { createInterceptor } from '@mswjs/interceptors'
import { interceptWebSocket } from '@mswjs/interceptors/lib/interceptors/WebSocket'

window.sockets = []
window.connections = []

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

// window.socket = new WebSocket('wss://example.com')

// socket.addEventListener('message', (event) => {
//   console.log('> %s', event.data)
// })

// document.body.addEventListener('click', () => {
//   socket.send('hello Mr. Socket!')
// })
