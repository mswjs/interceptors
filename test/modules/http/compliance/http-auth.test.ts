// @vitest-environment node
import http from 'node:http'
import https from 'node:https'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { getTestServer } from '#/test/setup/vitest'
import { toWebResponse } from '#/test/helpers'

const server = getTestServer()

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

function createKeepAliveAgent() {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
  onTestFinished(() => agent.destroy())
  return agent
}

it('exposes the "auth" option as the "authorization" header of the intercepted request', async () => {
  const requestPromise = new Promise<Request>((resolve) => {
    interceptor.on('request', ({ request, controller }) => {
      resolve(request)
      controller.respondWith(new Response('mocked'))
    })
  })

  await toWebResponse(http.get('http://localhost/', { auth: 'admin:secret' }))

  const request = await requestPromise
  expect
    .soft(request.headers.get('authorization'))
    .toBe('Basic YWRtaW46c2VjcmV0')
  expect.soft(request.url).toBe('http://localhost/')
})

it('sends the "auth" option to the server on a passthrough request', async () => {
  const [response] = await toWebResponse(
    http.get(server.http.url('/'), { auth: 'admin:secret' })
  )

  expect(response.headers.get('authorization')).toBe('Basic YWRtaW46c2VjcmV0')
})

it('exposes the credentials of the request url as the "authorization" header', async () => {
  const requestPromise = new Promise<Request>((resolve) => {
    interceptor.on('request', ({ request, controller }) => {
      resolve(request)
      controller.respondWith(new Response('mocked'))
    })
  })

  await toWebResponse(http.get('http://admin:secret@localhost/'))

  const request = await requestPromise
  expect
    .soft(request.headers.get('authorization'))
    .toBe('Basic YWRtaW46c2VjcmV0')
  expect
    .soft(request.url, 'strips the credentials from the url')
    .toBe('http://localhost/')
})

it('sends the credentials of the request url to the server on a passthrough request', async () => {
  const url = server.http.url('/')
  url.username = 'admin'
  url.password = 'secret'

  const [response] = await toWebResponse(http.get(url))

  expect(response.headers.get('authorization')).toBe('Basic YWRtaW46c2VjcmV0')
})

it('preserves special characters in the credentials', async () => {
  const requestPromise = new Promise<Request>((resolve) => {
    interceptor.on('request', ({ request, controller }) => {
      resolve(request)
      controller.respondWith(new Response('mocked'))
    })
  })

  await toWebResponse(
    http.get('http://localhost/', { auth: 'foo@bar.com:se:cr/et+' })
  )

  const request = await requestPromise
  expect(request.headers.get('authorization')).toBe(
    `Basic ${btoa('foo@bar.com:se:cr/et+')}`
  )
})

it('prefers the explicit "authorization" header over the "auth" option', async () => {
  const requestPromise = new Promise<Request>((resolve) => {
    interceptor.on('request', ({ request, controller }) => {
      resolve(request)
      controller.respondWith(new Response('mocked'))
    })
  })

  await toWebResponse(
    http.get('http://localhost/', {
      auth: 'admin:secret',
      headers: { authorization: 'Bearer token' },
    })
  )

  const request = await requestPromise
  expect(request.headers.get('authorization')).toBe('Bearer token')
})

it('sends the "auth" option to the server on a passthrough https request', async () => {
  const [response] = await toWebResponse(
    https.get(server.https.url('/'), {
      auth: 'admin:secret',
      rejectUnauthorized: false,
    })
  )

  expect(response.headers.get('authorization')).toBe('Basic YWRtaW46c2VjcmV0')
})

it('does not forward the "auth" of a previous request on a kept-alive socket (passthrough)', async () => {
  const agent = createKeepAliveAgent()
  const url = server.http.url('/')

  const [authenticatedResponse] = await toWebResponse(
    http.get(url, { agent, auth: 'admin:secret' })
  )
  expect(authenticatedResponse.headers.get('authorization')).toBe(
    'Basic YWRtaW46c2VjcmV0'
  )

  const [anonymousResponse] = await toWebResponse(http.get(url, { agent }))
  expect(anonymousResponse.headers.get('authorization')).toBeNull()
})

it('does not expose the "auth" of a previous request on a kept-alive socket (request listener)', async () => {
  const authorizationHeaders: Array<string | null> = []
  interceptor.on('request', ({ request, controller }) => {
    authorizationHeaders.push(request.headers.get('authorization'))
    controller.respondWith(new Response('mocked'))
  })

  const agent = createKeepAliveAgent()
  const url = server.http.url('/')

  await toWebResponse(http.get(url, { agent, auth: 'admin:secret' }))
  await toWebResponse(http.get(url, { agent }))

  expect(authorizationHeaders).toEqual(['Basic YWRtaW46c2VjcmV0', null])
})

it('uses the "auth" of each request on a kept-alive socket', async () => {
  const authorizationHeaders: Array<string | null> = []
  interceptor.on('request', ({ request, controller }) => {
    authorizationHeaders.push(request.headers.get('authorization'))
    controller.respondWith(new Response('mocked'))
  })

  const agent = createKeepAliveAgent()
  const url = server.http.url('/')

  await toWebResponse(http.get(url, { agent, auth: 'first:one' }))
  await toWebResponse(http.get(url, { agent }))
  await toWebResponse(http.get(url, { agent, auth: 'second:two' }))

  expect(authorizationHeaders).toEqual([
    `Basic ${btoa('first:one')}`,
    null,
    `Basic ${btoa('second:two')}`,
  ])
})

it('does not forward the credentials of a previous request url on a kept-alive socket', async () => {
  const agent = createKeepAliveAgent()
  const authenticatedUrl = server.http.url('/')
  authenticatedUrl.username = 'admin'
  authenticatedUrl.password = 'secret'

  const [authenticatedResponse] = await toWebResponse(
    http.get(authenticatedUrl, { agent })
  )
  expect(authenticatedResponse.headers.get('authorization')).toBe(
    'Basic YWRtaW46c2VjcmV0'
  )

  const [anonymousResponse] = await toWebResponse(
    http.get(server.http.url('/'), { agent })
  )
  expect(anonymousResponse.headers.get('authorization')).toBeNull()
})

it('receives a mocked "401 Unauthorized" response with its challenge', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="protected"' },
      })
    )
  })

  const [response] = await toWebResponse(http.get('http://localhost/'))

  expect.soft(response.status).toBe(401)
  expect
    .soft(response.headers.get('www-authenticate'))
    .toBe('Basic realm="protected"')
})
