import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('exposes the initiator for a mocked fetch request', async () => {
  const pendingInitiator = Promise.withResolvers<unknown>()

  interceptor.on('request', ({ initiator, controller }) => {
    pendingInitiator.resolve(initiator)
    controller.respondWith(new Response('hello world'))
  })

  const response = await fetch('http://any.host.here/resource')

  const initiator = await pendingInitiator.promise
  expect.soft(initiator).toBeInstanceOf(Request)
  expect.soft(initiator).toMatchObject({
    method: 'GET',
    url: 'http://any.host.here/resource',
  })
  await expect.soft(response.text()).resolves.toBe('hello world')
})
