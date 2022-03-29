import { createInterceptor } from '@mswjs/interceptors'
import { interceptWebSocket } from '@mswjs/interceptors/lib/interceptors/WebSocket'

const interceptor = createInterceptor({
  modules: [interceptWebSocket],
  resolver(event) {
    window.resolver(event)
  },
  // resolver(event) {
  //   console.warn('[interceptor] ws connection established!', event)

  //   const { connection } = event
  //   window.connections.push(connection)

  //   connection.on('message', (...args) => {
  //     console.warn('[interceptor] ws message received!', ...args)
  //   })

  //   connection.on('greet', (who) => {
  //     console.log('[interceptor] should greet:', who)

  //     /**
  //      * @fixme This forces socket.io to disconnect.
  //      * "transport error"
  //      */
  //     connection.send(`hello to you too ${who}`)
  //   })

  //   connection.on('close', () => {
  //     console.log('[interceptor] socket connection closed')
  //   })
  // },
})

interceptor.apply()

// Require "socket.io" after the interceptor so it hoists
// the overridden WebSocket constructor.
async function importSocketIo() {
  const socketIO = await import('socket.io-client')
  window.io = socketIO.default
}
importSocketIo()
