// @vitest-environment node
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { sleep, toWebResponse } from '../../../helpers'

const server = new HttpServer((app) => {
  app.get('/original', async (req, res) => {
    res.header('X-Custom-Header', 'yes').send('hello')
  })
})

const interceptor = new HttpRequestInterceptor()

async function getResponse(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/mocked': {
      return new Promise(async (resolve) => {
        // Defer the resolution of the promise to the next tick.
        // Request handlers in MSW resolve on the next tick.
        await sleep(0)

        const originalRequest = http.get(server.http.url('/original'))
        const [response, rawResponse] = await toWebResponse(originalRequest)

        const getHeader = (name: string): string | undefined => {
          const value = rawResponse.headers[name]
          return Array.isArray(value) ? value.join(', ') : value
        }

        const responseText = (await response.text()) + ' world'

        resolve(
          new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              'X-Custom-Header': getHeader('x-custom-header') || '',
            },
          })
        )
      })
    }
  }
}

interceptor.on('request', async ({ request, controller }) => {
  const response = await getResponse(request)

  if (response) {
    controller.respondWith(response)
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
  const [response] = await toWebResponse(req)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('x-custom-header')).toBe('yes')
  await expect(response.text()).resolves.toBe('hello world')
})
