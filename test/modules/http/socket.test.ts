import './socket.impl'

import net from 'net'
import http from 'http'
import { it, expect } from 'vitest'

it('supports HTTP requests on the Socket level', async () => {
  await new Promise<void>((resolve, reject) => {
    http
      .get('http://api.example.com/resource', (response) => {
        console.log(response.statusCode, response.statusMessage)
        expect(response.statusCode).toBe(301)
        expect(response.statusMessage).toBe('Moved Permanently')
        resolve()
      })
      .on('error', reject)
  })
})

it('supports SMTP requests at the Socket level', async () => {
  const socket = net.createConnection(25, 'gmail-smtp-in.l.google.com')
  socket.write('FROM: <user@site.com>\r\n')
  socket.write('TO: <user@site.com>\r\n')
  socket.write('SUBJECT: Greeting\r\n')
  socket.write('Hello, world!\r\n')
  socket.write('.\r\n')

  socket.on('error', console.error)
})
