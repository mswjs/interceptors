import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'
import { sleep } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original response')
  })
})

const interceptor = new FetchInterceptor()

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

it('awaits asynchronous response event listener for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const responseDone = vi.fn()
  interceptor.on('response', async ({ response }) => {
    await sleep(100)
    const text = await response.text()
    responseDone(text)
  })

  const response = await fetch('http://localhost/')

  expect(await response.text()).toBe('hello world')
  expect(responseDone).toHaveBeenCalledWith('hello world')
})

it('awaits asynchronous response event listener for the original response', async () => {
  const responseDone = vi.fn()
  interceptor.on('response', async ({ response }) => {
    await sleep(100)
    const text = await response.text()
    responseDone(text)
  })

  
  const response = await fetch(httpServer.http.url('/resource'))

  expect(await response.text()).toBe('original response')
  expect(responseDone).toHaveBeenCalledWith('original response')
})
