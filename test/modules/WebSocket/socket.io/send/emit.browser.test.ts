import path from 'path'
import { pageWith } from 'page-with'
import { ServerApi, createServer } from '@open-draft/test-server'
import { io as socketClient, Socket } from 'socket.io-client'
import waitForExpect from 'wait-for-expect'
import { Resolver, WebSocketEvent } from '../../../../../src'

declare namespace window {
  export const io: typeof socketClient
  export let socket: Socket
  export let event: WebSocketEvent
  export let resolver: Resolver<WebSocketEvent>
}

let testServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../websocket.runtime.js'),
  })
}

beforeAll(async () => {
  testServer = await createServer()
})

afterAll(async () => {
  await testServer.close()
})

it('emits custom events from the connection', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event) => {
      window.event = event
    }

    document.body.addEventListener('click', () => {
      window.event.connection.emit('greet', 'Kate')
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
