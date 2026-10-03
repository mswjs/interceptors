// @vitest-environment node
import net from 'node:net'
import http2 from 'node:http2'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { connectHttp2Session, toHttp2WebResponse } from '#/test/helpers'

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
