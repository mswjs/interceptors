// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  spyOnXMLHttpRequestUpload,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('does not lock the request body stream when calculating the total request body size for uploads', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    const buffer = await request.arrayBuffer()
    controller.respondWith(new Response(buffer))
  })

  const request = new XMLHttpRequest()
  const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
  request.open('POST', '/resource')
  request.send('hello world')

  await waitForXMLHttpRequest(request)

  expect.soft(request.responseText).toBe('hello world')
  expect(uploadEvents).toEqual([
    ['loadstart', { loaded: 0, total: 11 }],
    ['progress', { loaded: 11, total: 11 }],
    ['load', { loaded: 11, total: 11 }],
    ['loadend', { loaded: 11, total: 11 }],
  ])
})
