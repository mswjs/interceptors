// @vitest-environment jsdom
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

it('supports lowercase HTTP request method', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'POST') {
      controller.respondWith(new Response('hello world'))
    }
  })

  const request = await createXMLHttpRequest((request) => {
    request.open('post', 'http://localhost/resource')
    request.send()
  })

  expect(request.responseText).toBe('hello world')
})
