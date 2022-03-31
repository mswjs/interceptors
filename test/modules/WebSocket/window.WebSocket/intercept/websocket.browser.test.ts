/**
 * @jest-environment node
 */
import * as path from 'path'
import { pageWith } from 'page-with'
import { ServerApi, createServer } from '@open-draft/test-server'
import { Resolver, WebSocketEvent } from '../../../../../src'
import waitForExpect from 'wait-for-expect'

declare namespace window {
  export let socket: WebSocket
  export let resolver: Resolver<WebSocketEvent>
}

let testServer: ServerApi

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../../interceptor.runtime.js'),
  })
}

beforeAll(async () => {
  testServer = await createServer()
})

afterAll(async () => {
  await testServer.close()
})

it('intercept the "message" event sent from the client', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.ws.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event) => {
      event.connection.on('message', (event) => {
        console.log((event as MessageEvent).data)
      })
    }
  })

  await runtime.page.evaluate((wsUrl) => {
    window.socket = new WebSocket(wsUrl)

    return new Promise((resolve) => {
      window.socket.addEventListener('open', resolve)
    })
  }, wsUrl)

  await runtime.page.evaluate(() => {
    window.socket.send('hello')
  })

  await waitForExpect(() => {
    expect(runtime.consoleSpy.get('log')).toEqual(['hello'])
  })
})
