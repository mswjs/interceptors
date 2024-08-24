// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/no-body': {
      controller.respondWith(new Response(null, { status: 204 }))
      break
    }

    case '/invalid-json': {
      controller.respondWith(
        new Response(`{"invalid: js'on`, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
      break
    }
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('handles response of type "json" and missing response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('PUT', '/no-body')
    req.responseType = 'json'
    req.send()
  })

  // When XHR fails to parse a given response JSON body,
  // fall back to null, as the failed JSON parsing result.
  expect(req.response).toBe(null)
  expect(req.responseType).toBe('json')
})

it('handles response of type "json" and invalid response JSON body', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/invalid-json')
    req.responseType = 'json'
    req.send()
  })

  expect(req.response).toBe(null)
  expect(req.responseType).toEqual('json')
})
