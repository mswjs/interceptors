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

it('drops the body of a mocked response to a HEAD request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: { 'x-custom-header': 'yes' },
      })
    )
  })

  const responseFromListenerPromise = Promise.withResolvers<Response>()
  interceptor.on('response', ({ response }) => {
    responseFromListenerPromise.resolve(response)
  })

  const response = await fetch('http://localhost/resource', {
    method: 'HEAD',
  })

  expect(response.status).toBe(200)
  expect(response.url).toBe('http://localhost/resource')
  expect(response.headers.get('x-custom-header')).toBe('yes')
  expect(response.body).toBeNull()
  await expect(response.text()).resolves.toBe('')

  // The "response" listener observes the mocked response as provided.
  const responseFromListener = await responseFromListenerPromise.promise
  await expect(responseFromListener.text()).resolves.toBe('hello world')
})
