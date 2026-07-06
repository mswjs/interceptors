import { DeferredPromise } from '@open-draft/deferred-promise'
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

it('intercepts a request without a body', async () => {
  const pendingRequestBody = new DeferredPromise<string>()
  interceptor.on('request', async ({ request, controller }) => {
    pendingRequestBody.resolve(await request.clone().text())
    controller.respondWith(new Response())
  })

  await fetch('http://localhost/empty')

  await expect(pendingRequestBody).resolves.toBe('')
})

it('intercepts a request with a Blob body', async () => {
  const pendingRequestBody = new DeferredPromise<string>()
  interceptor.on('request', async ({ request, controller }) => {
    pendingRequestBody.resolve(await request.clone().text())
    controller.respondWith(new Response())
  })

  await fetch('http://localhost/blob', {
    method: 'POST',
    body: new Blob(['blob', 'string']),
  })

  await expect(pendingRequestBody).resolves.toBe('blobstring')
})

it('intercepts a request with a FormData body', async () => {
  const pendingRequestBody = new DeferredPromise<string>()
  interceptor.on('request', async ({ request, controller }) => {
    pendingRequestBody.resolve(await request.clone().text())
    controller.respondWith(new Response())
  })

  const formData = new FormData()
  formData.set('username', 'john')
  formData.set('password', 'secret-123')

  await fetch('http://localhost/form-data', {
    method: 'POST',
    body: formData,
  })

  /**
   * @note The multipart boundary format differs between environments
   * (e.g. "WebKitFormBoundary" in the browser vs "formdata-undici" in Node.js)
   * so only assert on the fields.
   */
  const requestBody = await pendingRequestBody
  expect(requestBody).toMatch(
    /content-disposition: form-data; name="username"\r\n\r\njohn\r\n/i
  )
  expect(requestBody).toMatch(
    /content-disposition: form-data; name="password"\r\n\r\nsecret-123\r\n/i
  )
})

it('intercepts a request with an ArrayBuffer body', async () => {
  const pendingRequestBody = new DeferredPromise<string>()
  interceptor.on('request', async ({ request, controller }) => {
    pendingRequestBody.resolve(await request.clone().text())
    controller.respondWith(new Response())
  })

  await fetch('http://localhost/array-buffer', {
    method: 'POST',
    body: new TextEncoder().encode('buffer string'),
  })

  await expect(pendingRequestBody).resolves.toBe('buffer string')
})

it('intercepts a request with a URLSearchParams body', async () => {
  const pendingRequestBody = new DeferredPromise<string>()
  interceptor.on('request', async ({ request, controller }) => {
    pendingRequestBody.resolve(await request.clone().text())
    controller.respondWith(new Response())
  })

  await fetch('http://localhost/search-params', {
    method: 'POST',
    body: new URLSearchParams({
      username: 'john',
      password: 'secret-123',
    }),
  })

  await expect(pendingRequestBody).resolves.toBe(
    'username=john&password=secret-123'
  )
})
