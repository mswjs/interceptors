// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  setTimeout,
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const encoder = new TextEncoder()
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

it('intercepts a bypassed request with a stream response', async ({ task }) => {
  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/stream'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response.replace(/\s+/g, '')).toBe('helloworld')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 1024, total: 3072 }],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 2048, total: 3072 }],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 3072, total: 3072 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 3072, total: 3072 }],
      ['loadend', 4, { loaded: 3072, total: 3072 }],
    ])
  }
})

it('responds with a mocked immediate chunked response', async ({ task }) => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
          },
        })
      )
    }

    const pad = (value: string) => value + ' '.repeat(1024 - value.length)
    const chunks = [pad('hello'), pad(' '), pad('world')]

    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()

        if (chunk) {
          return controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      },
    })

    controller.respondWith(
      new Response(stream, {
        headers: {
          'content-type': 'text/plain',
          'content-length': chunks.join('').length.toString(),
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response.replace(/\s+/g, '')).toBe('helloworld')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 3072, total: 3072 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 3072, total: 3072 }],
      ['loadend', 4, { loaded: 3072, total: 3072 }],
    ])
  }
})

it('responds with a mocked delayed chunked response', async ({ task }) => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
          },
        })
      )
    }

    /**
     * @note The browser buffers the incoming response chunks unless a chunk exceeds
     * 1KB. Simulate three chunks, each 1KB in size to trigger the "progress" event for each chunk.
     */
    const pad = (value: string) => value + ' '.repeat(1024 - value.length)
    const chunks = [pad('hello'), pad(' '), pad('world')]

    const stream = new ReadableStream({
      async pull(controller) {
        const chunk = chunks.shift()

        if (chunk) {
          await setTimeout(100)
          return controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      },
    })

    controller.respondWith(
      new Response(stream, {
        headers: {
          'content-type': 'text/plain',
          'content-length': chunks.join('').length.toString(),
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.response.replace(/\s+/g, '')).toBe('helloworld')

  if (task.file.projectName === 'browser') {
    expect(events).toEqual([
      ['readystatechange', 1],
      ['loadstart', 1, { loaded: 0, total: 0 }],
      ['readystatechange', 2],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 1024, total: 3072 }],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 2048, total: 3072 }],
      ['readystatechange', 3],
      ['progress', 3, { loaded: 3072, total: 3072 }],
      ['readystatechange', 4],
      ['load', 4, { loaded: 3072, total: 3072 }],
      ['loadend', 4, { loaded: 3072, total: 3072 }],
    ])
  }
})
