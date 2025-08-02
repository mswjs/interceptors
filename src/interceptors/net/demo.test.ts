// @vitest-environment node
import { beforeAll, afterAll, it, expect } from 'vitest'
import { HttpRequestInterceptor } from './http-interceptor'
import { waitForClientRequest } from '../../../test/helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('???', async () => {
  interceptor.on('request', ({ request, controller }) => {
    console.log('REQUEST LISTENER!')
    controller.respondWith(new Response('hello world'))
  })

  const http = await import('http')
  const request = http.get('http://localhost/resource')

  await waitForClientRequest(request)
})
