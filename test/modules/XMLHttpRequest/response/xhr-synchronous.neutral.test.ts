// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { spyOnXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.clearAllMocks()
})

afterAll(() => {
  interceptor.dispose()
  vi.restoreAllMocks()
})

/**
 * @note The way HappyDOM performs synchronous XMLHttpRequest is via "ChildProcess.execFileSync",
 * which bypassed the "net.connect()" and makes such requests invisible to our interceptor.
 * We do not support synchronous XMLHttpRequest.
 */
it('prints a warning upon attempts to handle a synchronous XMLHttpRequest', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('must not receive this', {
        headers: {
          'access-control-allow-origin': '*',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', server.http.url('/'), false)
  request.send()

  expect.soft(request.readyState).toBe(4)
  expect.soft(request.status).toBe(200)
  expect.soft(request.response).toBe('original-response')

  if (task.file.projectName === 'browser') {
    await expect
      .poll(() => console.warn)
      .toHaveBeenCalledExactlyOnceWith(
        `Failed to intercept an XMLHttpRequest (GET ${server.http.url('/')}): synchronous requests are not supported. This request will be performed as-is.`
      )
    expect(events).toEqual([
      ['readystatechange', 1],
      ['readystatechange', 4],
      ['load', 4, { loaded: 17, total: 17 }],
      ['loadend', 4, { loaded: 17, total: 17 }],
    ])
  }
})
