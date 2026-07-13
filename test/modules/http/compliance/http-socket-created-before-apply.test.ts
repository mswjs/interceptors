// @vitest-environment node
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource/*', (req, res) => {
    res.status(200).send('original')
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

it.only('intercepts a request after interceptor.apply(), even if it reuse a socket created beforehand', async () => {
  const requestListener = vi.fn()

  interceptor.on('request', async ({ request }) => {
    requestListener(await request.text())
  })

  {
    const request = http.get(httpServer.http.url('/resource/one'))
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await response.text() // must read the response body to free the socket
    expect(requestListener).not.toHaveBeenCalled()
  }

  interceptor.apply()
  {
    const request = http.get(httpServer.http.url('/resource/one'))
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    expect(requestListener).toHaveBeenCalledOnce()
  }
})