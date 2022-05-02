/**
 * @jest-environment node
 */
import * as path from 'path'
import { io as socketClient, Socket } from 'socket.io-client'
import { WebSocketServer } from '@open-draft/test-server/ws'
import { pageWith } from 'page-with'
import waitForExpect from 'wait-for-expect'
import type { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'

declare namespace window {
  export const io: typeof socketClient
  export let socket: Socket
  export const interceptor: WebSocketInterceptor
}

const wsServer = new WebSocketServer()

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../socket.io.runtime.js'),
  })
}

beforeAll(async () => {
  await wsServer.listen()
})

afterAll(async () => {
  await wsServer.close()
})

it.only('intercepts message events sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = wsServer.ws.address.href

  /**
   * @todo Support sending actual requests to the server.
   */
  // const serverConnectionListener = jest.fn()
  // wsServer.ws.on('connection', (socket) => {
  //   socket.on('message', serverConnectionListener)
  // })

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      socket.on('message', (text) => {
        // "socket.io" does not send "MessageEvent".
        console.log(text)
      })
    })
  })

  await runtime.page.evaluate((wsUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wsUrl, {
        transports: ['polling'],
      })
      window.socket.on('connect', () => {
        resolve()
      })
      window.socket.on('error', console.error)
      window.socket.on('close', console.error)
    })
  }, wsUrl)

  await runtime.page.evaluate(() => {
    window.socket.send('hello')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello'])
  })

  await runtime.debug()

  // The actual server must receive the event.
  // expect(serverConnectionListener).toHaveBeenCalledWith('hello')
})

it('intercepts custom events sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = wsServer.ws.address.href

  // const serverMessageListener = jest.fn()
  // wsServer.ws.on('connection', (socket) => {
  //   socket.on('greeting', (text) => {
  //     serverMessageListener(text)
  //   })
  // })

  await runtime.page.evaluate(() => {
    window.interceptor.on('connection', (socket) => {
      socket.on('greeting', (text) => {
        console.log(text)
      })
    })
  })

  await runtime.page.evaluate((wsUrl) => {
    return new Promise<void>((resolve) => {
      window.socket = window.io(wsUrl, {
        transports: ['polling'],
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

  // The actual server must receive the event.
  // expect(serverMessageListener).toHaveBeenCalledWith('John')
})
