// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import * as http from 'node:http'
import * as https from 'node:https'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('mocks a response to a request made via * as http import', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = http.request('http://localhost/api').end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})

it('mocks a response to a request made via * as https import', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = https.request('https://localhost/api').end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})
