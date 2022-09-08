/**
 * @jest-environment node
 */
import * as path from 'path'
import { HttpServer } from '@open-draft/test-server/http'
import { pageWith, ScenarioApi } from 'page-with'
import { extractPureBeaconEventDetails } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/original', (_req, res) => {
    res.sendStatus(204)
  })
})

function prepareRuntime() {
  return pageWith({
    example: path.resolve(
      __dirname,
      'send-beacon-response-patching.browser.runtime.js'
    ),
  })
}

async function callSendBeacon(
  context: ScenarioApi,
  url: string,
  data?: BodyInit | null
): Promise<[null | { url: string; data?: BodyInit | null }, boolean]> {
  return Promise.all([
    extractPureBeaconEventDetails(context.page),
    context.page.evaluate(
      ({ url, data }) => {
        return navigator.sendBeacon(url, data)
      },
      { url, data }
    ),
  ])
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('forwards call to the original sendBeacon without response patching', async () => {
  const context = await prepareRuntime()
  const url = httpServer.http.url('/original')
  const [eventDetail] = await callSendBeacon(context, url, 'test')

  expect(eventDetail).not.toBe(null)
  expect(eventDetail?.url).toBe(url)
  expect(eventDetail?.data).toBe('test')
})

test('does not forward the call to the original sendBeacon with response patching', async () => {
  const context = await prepareRuntime()
  const url = httpServer.http.url('/mocked')
  const [eventDetail] = await callSendBeacon(context, url, 'test')

  expect(eventDetail).toBe(null)
})
