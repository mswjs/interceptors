import { DeferredPromise } from '@open-draft/deferred-promise'
import { RequestController, encodeBuffer } from '@mswjs/interceptors'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { getTestServer } from '#/test/setup/vitest'

/**
 * @note Allow requests to the test server despite its self-signed certificate.
 * Only applies to Node.js. In the browser, Playwright ignores certificate errors.
 */
if (typeof process !== 'undefined' && 'env' in process) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

type RequestEventPayload = {
  request: Request
  requestId: string
  controller: RequestController
}

const server = getTestServer()
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

describe.each(['http', 'https'] as const)('%s', (protocol) => {
  it('intercepts a HEAD request', async () => {
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      method: 'HEAD',
      headers: {
        'x-custom-header': 'yes',
      },
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('HEAD')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(request.body).toBe(null)
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
  })

  it('intercepts a GET request', async () => {
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('GET')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(request.body).toBe(null)
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('original-response')
  })

  it('intercepts a POST request', async () => {
    const requestBodyPromise = new DeferredPromise<string>()
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      // Read the request body via a clone because the bypassed
      // request consumes the original body.
      requestBodyPromise.resolve(request.clone().text())
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: true }),
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('POST')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(requestBodyPromise).resolves.toBe(
      JSON.stringify({ body: true })
    )
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe(JSON.stringify({ body: true }))
  })

  it('intercepts a PUT request', async () => {
    const requestBodyPromise = new DeferredPromise<string>()
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      requestBodyPromise.resolve(request.clone().text())
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      body: encodeBuffer('request-payload'),
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('PUT')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(requestBodyPromise).resolves.toBe('request-payload')
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('request-payload')
  })

  it('intercepts a PATCH request', async () => {
    const requestBodyPromise = new DeferredPromise<string>()
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      requestBodyPromise.resolve(request.clone().text())
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      body: encodeBuffer('request-payload'),
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('PATCH')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    await expect(requestBodyPromise).resolves.toBe('request-payload')
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('request-payload')
  })

  it('intercepts a DELETE request', async () => {
    const requestEventPromise = new DeferredPromise<RequestEventPayload>()
    interceptor.on('request', ({ request, requestId, controller }) => {
      requestEventPromise.resolve({ request, requestId, controller })
    })

    const response = await fetch(server[protocol].url('/user?id=123'), {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
    })

    const { request, requestId, controller } = await requestEventPromise

    expect(request.method).toBe('DELETE')
    expect(request.url).toBe(server[protocol].url('/user?id=123').href)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(controller).toBeInstanceOf(RequestController)
    expect(requestId).toMatch(/^\w{9,}$/)

    expect(response.status).toBe(200)
  })
})

it('sets "credentials" to "include" on the intercepted request', async ({
  task,
}) => {
  const requestCredentialsPromise = new DeferredPromise<string>()
  interceptor.on('request', ({ request, controller }) => {
    requestCredentialsPromise.resolve(request.credentials)
    controller.respondWith(new Response())
  })

  await fetch(server.http.url('/user'), {
    credentials: 'include',
  })

  if (task.file.projectName === 'browser') {
    await expect(requestCredentialsPromise).resolves.toBe('include')
  } else {
    /**
     * @note The HTTP message has no notion of credentials.
     * In Node.js, the intercepted request is parsed from the wire
     * so it always has the default credentials.
     */
    await expect(requestCredentialsPromise).resolves.toBe('same-origin')
  }
})

it('sets "credentials" to "omit" on the intercepted request', async ({
  task,
}) => {
  const requestCredentialsPromise = new DeferredPromise<string>()
  interceptor.on('request', ({ request, controller }) => {
    requestCredentialsPromise.resolve(request.credentials)
    controller.respondWith(new Response())
  })

  await fetch(server.http.url('/user'), {
    credentials: 'omit',
  })

  if (task.file.projectName === 'browser') {
    await expect(requestCredentialsPromise).resolves.toBe('omit')
  } else {
    await expect(requestCredentialsPromise).resolves.toBe('same-origin')
  }
})
