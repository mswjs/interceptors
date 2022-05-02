/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../ClientRequest'
import { WebSocketPollingInterceptor } from './WebSocketPollingInterceptor'

const interceptor = new WebSocketPollingInterceptor({
  using: new ClientRequestInterceptor(),
})

const httpServer = new HttpServer((app) => {
  app.post('/', (req, res) => res.status(200).end())
})

beforeAll(async () => {
  await httpServer.listen()
})

function makeRequest() {
  return fetch(httpServer.http.url('/'), {
    method: 'POST',
  })
    .then(() => {})
    .catch(() => {})
}

afterEach(() => {
  interceptor.dispose()
})

afterAll(async () => {
  await httpServer.close()
})

it('does not emit transport events after the interceptor is disposed', async () => {
  const listener = jest.fn()
  interceptor.apply()
  interceptor['interceptor'].on('request', (request) => {
    listener()
  })

  await makeRequest()
  expect(listener).toHaveBeenCalledTimes(1)

  await makeRequest()
  expect(listener).toHaveBeenCalledTimes(2)

  listener.mockReset()
  interceptor.dispose()

  await makeRequest()
  await makeRequest()
  expect(listener).toHaveBeenCalledTimes(0)
})
