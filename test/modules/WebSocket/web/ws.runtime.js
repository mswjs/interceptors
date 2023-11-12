import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'

const chatElement = document.createElement('div')
chatElement.setAttribute('id', 'chat')
document.body.appendChild(chatElement)

function addMessage(text, sender) {
  const message = document.createElement('p')
  message.innerText = `[${sender}]: ${text}`
  chatElement.appendChild(message)
}

const interceptor = new WebSocketInterceptor()
interceptor.apply()

interceptor.on('connection', (connection) => {
  connection.open()

  connection.on('message', async (data) => {
    addMessage(data, 'client')

    await new Promise((resolve) => setTimeout(resolve, 750))

    if (data.includes('My name is John')) {
      connection.send(`Greetings, John!`)
      connection.close()
    }
  })
})

const ws = new WebSocket('ws://non-existing-host.com')
ws.addEventListener('open', () => {
  console.log('[ws] event:open')

  ws.send('Hi! My name is John.')

  ws.addEventListener('message', async (event) => {
    console.log('[ws] event:message', event.data)

    addMessage(event.data, 'server')

    if (event.data.includes('Greetings')) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      ws.send('Happy to be here!')
    }
  })
})

ws.addEventListener('error', (error) => {
  console.log('[ws] event:error', error)
})

ws.addEventListener('close', (event) => {
  console.trace('[ws] event:close', event)
})
