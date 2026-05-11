import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral.js'

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

it('exposes the initiator for a mocked XMLHttpRequest', async () => {
  const pendingInitiator = new DeferredPromise<XMLHttpRequest>()

  interceptor.on('request', ({ initiator, controller }) => {
    pendingInitiator.resolve(initiator as XMLHttpRequest)
    controller.respondWith(new Response('hello world'))
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/resource')
  request.send()

  await waitForXMLHttpRequest(request)

  await expect.soft(pendingInitiator).resolves.toEqual(request)
  expect.soft(request.responseText).toBe('hello world')
})
