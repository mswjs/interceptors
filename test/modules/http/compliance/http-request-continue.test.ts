// @vitest-environment node
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('Unmocked request with `Expect: 100-continue` triggers continue event', async () => {
  const body = 'this is the full request body'
  const request = http.get(httpServer.http.url('/resource'), {
    headers: { Expect: '100-continue' },
  })
  request.on('continue', () => {
    request.end(body)
  })

  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('original response')
})

it.todo('Mocked request with `Expect: 100-continue` triggers continue event')
