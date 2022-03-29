import { createInterceptor } from '@mswjs/interceptors'
import { interceptWebSocket } from '@mswjs/interceptors/lib/interceptors/WebSocket'

const interceptor = createInterceptor({
  modules: [interceptWebSocket],
  resolver(event) {
    const { connection } = event

    console.warn('interceptor: ws connection established!', event)
    window.connections.push(connection)

    connection.on('message', (...args) => {
      console.warn('interceptor: ws message received!', ...args)
    })

    connection.on('greet', (who) => {
      console.log('server: should greet', who)

      /**
       * @fixme This forces socket.io to disconnect.
       * "transport error"
       */
      connection.send('greet', `42["hello to you too ${who}"]`)
    })
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
