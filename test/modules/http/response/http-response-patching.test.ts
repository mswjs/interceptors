import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { BatchInterceptor } from '../../../../src'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep, waitForClientRequest } from '../../../helpers'

const server = new HttpServer((app) => {
  app.get('/original', async (req, res) => {
    res.header('X-Custom-Header', 'yes').send('hello')
  })
})

const interceptor = new BatchInterceptor({
  name: 'response-patching',
  interceptors: [new ClientRequestInterceptor()],
})

async function getResponse(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/mocked': {
      return new Promise(async (resolve) => {
        // Defer the resolution of the promise to the next tick.
        // Request handlers in MSW resolve on the next tick.
        await sleep(0)

        const originalRequest = http.get(server.http.url('/original'))
        const { res, text } = await waitForClientRequest(originalRequest)

        const getHeader = (name: string): string | undefined => {
          const value = res.headers[name]
          return Array.isArray(value) ? value.join(', ') : value
        }

        const responseText = (await text()) + ' world'

        resolve(
          new Response(responseText, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: {
              'X-Custom-Header': getHeader('x-custom-header') || '',
            },
          })
        )
      })
    }
  }
}

interceptor.on('request', async ({ request }) => {
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

it('supports response patching', async () => {
  const req = http.get('http://localhost/mocked')
  const { res, text } = await waitForClientRequest(req)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(res.headers['x-custom-header']).toBe('yes')
  expect(await text()).toBe('hello world')
})
