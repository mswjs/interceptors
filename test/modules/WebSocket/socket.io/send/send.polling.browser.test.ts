/**
 * @jest-environment node
 */
import path from 'path'
import { pageWith } from 'page-with'
import { WebSocketServer } from '@open-draft/test-server/ws'
import { io as socketClient, Socket } from 'socket.io-client'
import waitForExpect from 'wait-for-expect'
import type { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'

declare namespace window {
  export const io: typeof socketClient
  export let socket: Socket
  export let interceptor: WebSocketInterceptor
}

const testServer = new WebSocketServer()

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../socket.io.runtime.js'),
  })
}

beforeAll(async () => {
  await testServer.listen()
})

afterAll(async () => {
  await testServer.close()
})

it('sends data from the connection', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      document.body.addEventListener('click', () => {
        // Send message to the connected socket
        // whenever clicked on the document body.
        socket.send('hello from server')
      })
    })
  })

  await runtime.page.evaluate((wssUrl) => {
    window.socket = window.io(wssUrl, {
      transports: ['polling'],
    })
    window.socket.on('message', (text) => {
      console.log(text)
    })

    return new Promise<void>((resolve) => {
      window.socket.on('connect', resolve)
    })
  }, wssUrl)

  await runtime.page.evaluate(() => {
    document.body.click()
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello from server'])
  })
})

it('sends data from the connection in response to client event', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      socket.on('greet', (name) => {
        socket.send(`hello, ${name}`)
      })
    })
  })

  await runtime.page.evaluate((wssUrl) => {
    window.socket = window.io(wssUrl, {
      transports: ['polling'],
    })
    window.socket.on('message', (text) => {
      console.log(text)
    })

    return new Promise<void>((resolve) => {
      window.socket.on('connect', resolve)
    })
  }, wssUrl)

  await runtime.page.evaluate(() => {
    window.socket.emit('greet', 'John')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello, John'])
  })
})

it('sends data to multiple clients', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      document.body.addEventListener('click', () => {
        socket.send('hello')
      })
    })
  })

  const [firstSocketId, secondSocketId] = await runtime.page.evaluate(
    (wssUrl) => {
      const firstSocket = window.io(wssUrl, {
        transports: ['polling'],
      })
      firstSocket.on('message', (text) => {
        console.log(`${firstSocket.id} ${text}`)
      })

      const secondSocket = window.io(wssUrl, {
        transports: ['polling'],
      })
      secondSocket.on('message', (text) => {
        console.log(`${secondSocket.id} ${text}`)
      })

      return Promise.all([
        new Promise<string>((resolve) =>
          firstSocket.on('connect', () => {
            resolve(firstSocket.id)
          })
        ),
        new Promise<string>((resolve) =>
          secondSocket.on('connect', () => {
            resolve(secondSocket.id)
          })
        ),
      ])
    },
    wssUrl
  )

  await runtime.page.evaluate(() => {
    document.body.click()
  })

  expect(runtime.consoleSpy.get('log')).toEqual([
    `${firstSocketId} hello`,
    `${secondSocketId} hello`,
  ])
})
