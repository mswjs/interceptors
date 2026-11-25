// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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

it('does not call a removed listener for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const loadListener = vi.fn()
  const request = new XMLHttpRequest()
  request.addEventListener('load', loadListener)
  request.removeEventListener('load', loadListener)
  request.open('GET', 'http://localhost/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(loadListener).not.toHaveBeenCalled()
})

it('does not call a removed upload listener for a mocked response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const progressListener = vi.fn()
  const request = new XMLHttpRequest()
  request.upload.addEventListener('progress', progressListener)
  request.upload.removeEventListener('progress', progressListener)
  request.open('POST', 'http://localhost/resource')
  request.send('hello world')

  await waitForXMLHttpRequest(request)

  expect(progressListener).not.toHaveBeenCalled()
})

it('calls only the current upload event handler for a mocked response', async ({
  task,
}) => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const previousProgressHandler = vi.fn()
  const progressHandler = vi.fn()
  const request = new XMLHttpRequest()
  request.upload.onprogress = previousProgressHandler
  request.upload.onprogress = progressHandler
  request.open('POST', 'http://localhost/resource')
  request.send('hello world')

  await waitForXMLHttpRequest(request)

  expect.soft(previousProgressHandler).not.toHaveBeenCalled()

  /**
   * @note The upload progress is only observable in the browser.
   * "happy-dom" does not fire the upload events.
   */
  if (task.file.projectName === 'browser') {
    expect.soft(progressHandler).toHaveBeenCalledOnce()
  }
})

it('dispatches an event on the upload', () => {
  const progressListener = vi.fn()
  const request = new XMLHttpRequest()
  request.upload.addEventListener('progress', progressListener)

  const event = new ProgressEvent('progress', { loaded: 5, total: 10 })
  const dispatched = request.upload.dispatchEvent(event)

  expect.soft(dispatched).toBe(true)
  expect.soft(progressListener).toHaveBeenCalledExactlyOnceWith(event)
})

it('does not call a removed upload listener for a dispatched event', () => {
  const progressListener = vi.fn()
  const request = new XMLHttpRequest()
  request.upload.addEventListener('progress', progressListener)
  request.upload.removeEventListener('progress', progressListener)
  request.upload.dispatchEvent(new ProgressEvent('progress'))

  expect(progressListener).not.toHaveBeenCalled()
})
