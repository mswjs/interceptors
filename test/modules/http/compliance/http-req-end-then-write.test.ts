import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.post('/resource', express.text({ type: '*/*' }), (req, res) => {
    res.send(req.body)
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

it('emits the ERR_STREAM_WRITE_AFTER_END error when write after end given no mocked response', async () => {
  const req = http.request(httpServer.http.url('/resource'))

  const errorReceived = new DeferredPromise<NodeJS.ErrnoException>()
  req.on('error', (error) => {
    errorReceived.resolve(error)
  })
  
  req.end()
  req.write('foo')

  const error = await errorReceived

  expect(error.code).toBe('ERR_STREAM_WRITE_AFTER_END')
})