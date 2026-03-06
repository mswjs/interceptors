// @vitest-environment happy-dom
import {
  spyOnXMLHttpRequest,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

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

it('treats "controller.errorWith()" as a request error for an HTTP request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('Network failure'))
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.response).toBe('')

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['readystatechange', 4],
      ['error', 4, { loaded: 0, total: 0 }],
      ['loadend', 4, { loaded: 0, total: 0 }],
    ])
  }
})

it('treats "controller.errorWith()" as a request error for an HTTPS request', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.errorWith(new Error('Network failure'))
  })

  const request = new XMLHttpRequest()
  const { events } = spyOnXMLHttpRequest(request)
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.response).toBe('')

  if (task.file.projectName === 'browser') {
    expect.soft(events).toEqual([
      ['readystatechange', 1],
      ['readystatechange', 4],
      ['error', 4, { loaded: 0, total: 0 }],
      ['loadend', 4, { loaded: 0, total: 0 }],
    ])
  }
})
