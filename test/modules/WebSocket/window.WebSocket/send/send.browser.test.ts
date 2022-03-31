/**
 * @jest-environment node
 */
import path from 'path'
import { pageWith } from 'page-with'
import { ServerApi, createServer } from '@open-draft/test-server'
import { Resolver, WebSocketEvent } from '../../../../../src'

declare namespace window {
  export let event: WebSocketEvent
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

it('sends data to a single client', async () => {
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
    const socket = new WebSocket(wssUrl)
    socket.addEventListener('message', (event) => {
      console.log(event.data)
    })

    return new Promise((resolve) => {
      socket.addEventListener('open', resolve)
    })
  }, wssUrl)

  await runtime.page.evaluate(() => {
    document.body.click()
  })

  expect(runtime.consoleSpy.get('log')).toEqual(['hello from server'])
})

it('sends data to multiple clients', async () => {
  const runtime = await prepareRuntime()
  const wssUrl = testServer.wss.address.toString()

  await runtime.page.evaluate(() => {
    window.resolver = (event) => {
      event.connection.send('hello')
    }
  })

  await runtime.page.evaluate((wssUrl) => {
    const firstSocket = new WebSocket(wssUrl)
    firstSocket.addEventListener('message', (event) => {
      console.log(`1 ${event.data}`)
    })

    const secondSocket = new WebSocket(wssUrl)
    secondSocket.addEventListener('message', (event) => {
      console.log(`2 ${event.data}`)
    })

    return Promise.all([
      new Promise((resolve) => (firstSocket.onopen = resolve)),
      new Promise((resolve) => (secondSocket.onopen = resolve)),
    ])
  }, wssUrl)

  await runtime.page.evaluate(() => {
    document.body.click()
  })

  expect(runtime.consoleSpy.get('log')).toEqual(['1 hello', '2 hello'])
})
