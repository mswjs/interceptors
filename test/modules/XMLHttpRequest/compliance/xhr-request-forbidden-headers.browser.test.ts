import { commands } from 'vitest/browser'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
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

/**
 * @see https://github.com/mswjs/msw/issues/2751
 */
it('does not print an error when setting a forbidden "cookie" header on the intercepted request', async () => {
  await commands.spyOnBrowserConsole()

  interceptor.on('request', ({ request }) => {
    if (request.method === 'OPTIONS') {
      return
    }

    request.headers.set('cookie', 'a=b')
  })

  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toBe(200)
  await expect(
    commands.getBrowserConsoleMessages()
  ).resolves.not.toContainEqual({
    type: 'error',
    text: 'Refused to set unsafe header "cookie"',
  })
})
