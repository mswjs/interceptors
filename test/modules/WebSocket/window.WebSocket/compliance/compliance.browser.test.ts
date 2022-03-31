/**
 * @jest-environment node
 */
import path from 'path'
import { pageWith } from 'page-with'
import { ServerApi, createServer } from '@open-draft/test-server'

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, '../../interceptor.runtime.js'),
  })
}

let testServer: ServerApi

beforeAll(async () => {
  testServer = await createServer()
})

afterAll(async () => {
  await testServer.close()
})

it('emits the "open" event when connecting to a non-existing server', async () => {
  const runtime = await prepareRuntime()

  const readyState = await runtime.page.evaluate(() => {
    const socket = new WebSocket('ws://localhost:8080')

    return new Promise((resolve) => {
      socket.addEventListener('open', () => {
        resolve(socket.readyState)
      })
    })
  })

  expect(readyState).toEqual(1)
})

it('emits the "open" event when connecting to an existing server', async () => {
  const runtime = await prepareRuntime()
  const wsUrl = testServer.wss.address.toString()

  const readyState = await runtime.page.evaluate((wsUrl) => {
    const socket = new WebSocket(wsUrl)

    return new Promise((resolve) => {
      socket.addEventListener('open', () => {
        resolve(socket.readyState)
      })
    })
  }, wsUrl)

  expect(readyState).toEqual(1)
})
