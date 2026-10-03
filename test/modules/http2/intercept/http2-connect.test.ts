// @vitest-environment node
import net from 'node:net'
import http2 from 'node:http2'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

/**
 * @note Reference "connect" before the interceptor is applied, the
 * same way an ESM named import of it binds to the unpatched function.
 */
const connectBeforeInterception = http2.connect

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a request made over a session connected with a string authority', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/resource'
  )
})

it('intercepts a request made over a session connected with a URL authority', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session(
    new URL('http://api.example.com:8080')
  )
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com:8080/resource'
  )
})

it('intercepts a request made over a session with a custom connection', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  await using session = connectHttp2Session('http://api.example.com', {
    createConnection() {
      return net.connect(80, 'api.example.com')
    },
  })
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/resource'
  )
})

it('intercepts a request made over a session with an established connection', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  const socket = net.connect(80, 'api.example.com')
  await new Promise<void>((resolve) => {
    socket.once('connect', resolve)
  })

  await using session = connectHttp2Session('http://api.example.com', {
    createConnection() {
      return socket
    },
  })
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/resource'
  )
})

it('invokes the connect listener of an intercepted session', async () => {
  const connectListener = vi.fn()
  const session = http2.connect('http://api.example.com', connectListener)
  onTestFinished(() => {
    session.destroy()
  })

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
})

it('intercepts a request made over a session connected with "connect" referenced before the interception', async () => {
  interceptor.on('request', ({ request, controller }) => {
    controller.respondWith(new Response(request.url))
  })

  const session = connectBeforeInterception('http://api.example.com')
  onTestFinished(() => {
    session.destroy()
  })
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe(
    'http://api.example.com/resource'
  )
})

it('intercepts a request made within a request listener over a session connected with "connect" referenced before the interception', async () => {
  await using server = await createRawTestServer(() => {
    return http2.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const requestListener = vi.fn<(url: string) => void>()

  interceptor.on('request', async ({ request, controller }) => {
    requestListener(request.url)

    if (!request.url.endsWith('/resource')) {
      return
    }

    const nestedSession = connectBeforeInterception(server.http.url('/'))
    onTestFinished(() => {
      nestedSession.destroy()
    })
    const nestedResponse = await toHttp2WebResponse(
      nestedSession.request({ ':path': '/nested' })
    )

    controller.respondWith(new Response(await nestedResponse.text()))
  })

  await using session = connectHttp2Session('http://api.example.com')
  const response = await toHttp2WebResponse(
    session.request({ ':path': '/resource' })
  )

  await expect(response.text()).resolves.toBe('original-response')
  expect(requestListener).toHaveBeenCalledTimes(2)
  expect(requestListener).toHaveBeenNthCalledWith(
    2,
    server.http.url('/nested').href
  )
})
