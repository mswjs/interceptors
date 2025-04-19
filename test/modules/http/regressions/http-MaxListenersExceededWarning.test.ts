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
    // Triggers 2 reads in the MockHttpSocket
    res.write('a')
    res.flushHeaders()
    res.write('a')
    res.end()
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
  const req = http.get(url)
  const { text } = await waitForClientRequest(req)
  
  expect(await text()).toBe('aa')
  expect(req.socket?.listenerCount('connect')).toBe(0);
})
