/**
 * @jest-environment node
 */
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

it('sends data from the connection', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event) => {
      document.body.addEventListener('click', () => {
        event.connection.send('hello from server')
      })
    }
  })

  await runtime.page.evaluate((wssUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wssUrl, {
        transports: ['websocket'],
      })
      window.socket.on('connect', resolve)
      window.socket.on('message', (text) => {
        console.log(text)
      })
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
    window.resolver = (event) => {
      const { connection } = event

      connection.on('greet', (text) => {
        connection.send(`hello, ${text}`)
      })
    }
  })

  await runtime.page.evaluate((wssUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wssUrl, {
        transports: ['websocket'],
      })
      window.socket.on('connect', resolve)
      window.socket.on('message', (text) => {
        console.log(text)
      })
    })
  }, wssUrl)

  await runtime.page.evaluate(() => {
    window.socket.emit('greet', 'John')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello, John'])
  })
})
