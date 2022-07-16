/**
 * @jest-environment node
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { BatchInterceptor, MockedResponse } from '../../../../src'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { sleep, waitForClientRequest } from '../../../helpers'
import { InteractiveIsomorphicRequest } from '../../../../src/InteractiveIsomorphicRequest'

const server = new HttpServer((app) => {
  app.get('/original', async (req, res) => {
    res.header('X-Custom-Header', 'yes').send('hello')
  })
})

const interceptor = new BatchInterceptor({
  name: 'response-patching',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
  ],
})

async function getResponse(
  request: InteractiveIsomorphicRequest
): Promise<MockedResponse | undefined> {
  switch (request.url.pathname) {
    case '/mocked': {
      return new Promise(async (resolve) => {
        // Defer the resolution of the promise to the next tick.
        // Request handlers in MSW resolve on the next tick.
        await sleep(0)

        const originalRequest = http.get(server.http.url('/original'))
        const { res, text } = await waitForClientRequest(originalRequest)

        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: {
            'X-Custom-Header': res.headers['x-custom-header'] || '',
          },
          body: (await text()) + ' world',
        })
      })
    }
  }
}

interceptor.on('request', async (request) => {
  const response = await getResponse(request)

  if (response) {
    request.respondWith(response)
  }
})

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

test('supports response patching', async () => {
  const req = http.get('http://localhost/mocked')
  const { res, text } = await waitForClientRequest(req)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(res.headers['x-custom-header']).toBe('yes')
  expect(await text()).toBe('hello world')
})
