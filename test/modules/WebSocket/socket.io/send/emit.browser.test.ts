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
  export const interceptor: WebSocketInterceptor
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

it('emits custom event to a single client', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      document.body.addEventListener('click', () => {
        socket.emit('greet', 'Kate')
      })
    })
  })

  await runtime.page.evaluate((wssUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wssUrl, {
        transports: ['websocket'],
      })
      window.socket.on('connect', resolve)
      window.socket.on('greet', (text) => {
        console.log(text)
      })
    })
  }, wssUrl)

  await runtime.page.evaluate(() => {
    document.body.click()
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['Kate'])
  })
})

it('emits custom events to all clients', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      document.body.addEventListener('click', () => {
        socket.emit('greet', 'John')
      })
    })
  })

  const [firstSocketId, secondSocketId] = await runtime.page.evaluate(
    (wssUrl) => {
      const firstSocket = window.io(wssUrl, {
        transports: ['websocket'],
      })
      firstSocket.on('greet', (username) => {
        console.log(`${firstSocket.id} ${username}`)
      })

      const secondSocket = window.io(wssUrl, {
        transports: ['websocket'],
      })
      secondSocket.on('greet', (username) => {
        console.log(`${secondSocket.id} ${username}`)
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
    `${firstSocketId} John`,
    `${secondSocketId} John`,
  ])
})
