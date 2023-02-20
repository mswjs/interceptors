/**
 * @jest-environment jsdom
 */
import { Response } from 'undici'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  request.respondWith(
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

test('sends a mocked response with an empty response body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/arbitrary-url')
    req.send()
  })

  expect(req.status).toEqual(401)
  expect(req.response).toEqual('')
})
