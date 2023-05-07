import './socket.impl'

import http from 'http'
import { it, expect } from 'vitest'

it('how sockets work', async () => {
  await new Promise<void>((resolve, reject) => {
    http
      .get('http://api.example.com', (response) => {
        console.log(response.statusCode, response.statusMessage)
        expect(response.statusCode).toBe(301)
        resolve()
      })
      .on('error', reject)
  })

  // SMTP example.
  // const socket = net.createConnection(25, 'smtp.example.com')
  // socket.write('HELO example.com\r\n')
})
