// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(
    new Response(null, {
      status: 401,
      statusText: 'Unauthorized',
    })
  )
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('sends a mocked response with an empty response body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.send()
  })

  expect(req.status).toEqual(401)
  expect(req.response).toEqual('')
})
