/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import {
  waitForClientRequest,
} from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    let count = 1
    const i = setInterval(() => {
      res.write('a')
      if (++count > 20) {
        clearInterval(i)
        res.end()
      }
    }, 10)
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does ', async () => {
  const url = httpServer.http.url('/')
  const warningListener = vi.fn()
  process.on('warning', warningListener)

  const req = http.get(url)
  const { text } = await waitForClientRequest(req)
  
  expect(await text()).toBe('a'.repeat(20))
  expect(warningListener).not.toHaveBeenCalled() 
})
