// @vitest-environment jsdom
/**
 * @see https://github.com/mswjs/interceptors/issues/281
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (url.pathname === '/cors') {
    controller.respondWith(Response.error())
    return
  }

  const status = url.searchParams.get('status')
  if (!status) {
    return
  }

  controller.respondWith(new Response(null, { status: Number(status) }))
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('keeps "status" as 0 if the request fails', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', '/cors')
    request.send()
  })

  expect(request.status).toBe(0)
})

it('respects error response status', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', '?status=500')
    request.send()
  })

  expect(request.status).toBe(500)
})

it('respects a custom "status" from the response', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.open('GET', '/?status=201')
    request.send()
  })

  expect(request.status).toBe(201)
})
