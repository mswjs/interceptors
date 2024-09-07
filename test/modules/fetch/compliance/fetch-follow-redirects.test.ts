// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/original', (req, res) =>
    res.writeHead(302, { Location: httpServer.http.url('/redirected') }).end()
  )
  app.get('/redirected', (req, res) => res.send('redirected'))
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('follows a bypassed redirect response', async () => {
  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('redirected')
})

it('follows a mocked redirect to the original server', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 302)
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('redirected')
})

it('follows a mocked redirect to a mocked response', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 302)
      )
    }

    if (request.url.endsWith('/redirected')) {
      return controller.respondWith(new Response('mocked response'))
    }
  })

  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked response')
})
