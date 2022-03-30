/**
 * @jest-environment node
 */
import * as path from 'path'
import { io as socketClient, Socket } from 'socket.io-client'
import { ServerApi, createServer } from '@open-draft/test-server'
import { pageWith } from 'page-with'
import waitForExpect from 'wait-for-expect'
import type { Resolver, WebSocketEvent } from '../../../../../src'

declare namespace window {
  export const io: typeof socketClient
  export let socket: Socket
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

it('intercepts the "message" event sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.ws.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event) => {
      event.connection.on('message', (text) => {
        // "socket.io" does not send "MessageEvent".
        console.log(text)
      })
    }
  })

  await runtime.page.evaluate((wsUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wsUrl, {
        transports: ['websocket'],
      })
      window.socket.on('connect', resolve)
    })
  }, wsUrl)

  await runtime.page.evaluate(() => {
    window.socket.send('hello')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello'])
  })
})

it('intercepts the custom event sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.ws.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event: WebSocketEvent) => {
      event.connection.on('greeting', (text) => {
        console.log(text)
      })
    }
  })

  await runtime.page.evaluate((wsUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wsUrl, {
        transports: ['websocket'],
      })
      window.socket.on('connect', resolve)
    })
  }, wsUrl)

  await runtime.page.evaluate(() => {
    window.socket.emit('greeting', 'John')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['John'])
  })
})
