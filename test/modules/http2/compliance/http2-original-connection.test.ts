// @vitest-environment node
import http2 from 'node:http2'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import {
  connectHttp2Session,
  createRawTestServer,
  toHttp2WebResponse,
} from '#/test/helpers'

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

it('does not connect to the original server for a mocked request', async () => {
  const originalSessionListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return http2.createServer().on('session', originalSessionListener)
  })

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-response'))
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const response = await toHttp2WebResponse(session.request({ ':path': '/' }))

  await expect(response.text()).resolves.toBe('mocked-response')
  expect(originalSessionListener).not.toHaveBeenCalled()
})

it('reuses a single original connection for the requests of the same session', async () => {
  const originalSessionListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return http2
      .createServer((_request, response) => {
        response.end('original-response')
      })
      .on('session', originalSessionListener)
  })

  await using session = connectHttp2Session(server.http.url('/'))
  await toHttp2WebResponse(session.request({ ':path': '/one' }))
  await toHttp2WebResponse(session.request({ ':path': '/two' }))

  expect(originalSessionListener).toHaveBeenCalledOnce()
})

it('establishes separate original connections for different sessions', async () => {
  const originalSessionListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return http2
      .createServer((_request, response) => {
        response.end('original-response')
      })
      .on('session', originalSessionListener)
  })

  await using firstSession = connectHttp2Session(server.http.url('/'))
  await using secondSession = connectHttp2Session(server.http.url('/'))
  await toHttp2WebResponse(firstSession.request({ ':path': '/' }))
  await toHttp2WebResponse(secondSession.request({ ':path': '/' }))

  expect(originalSessionListener).toHaveBeenCalledTimes(2)
})

it('establishes a new original connection after the previous one closes', async () => {
  const originalSessions: Array<http2.ServerHttp2Session> = []

  await using server = await createRawTestServer(() => {
    return http2
      .createServer((_request, response) => {
        response.end('original-response')
      })
      .on('session', (originalSession) => {
        originalSessions.push(originalSession)
      })
  })

  await using session = connectHttp2Session(server.http.url('/'))
  const firstResponse = await toHttp2WebResponse(
    session.request({ ':path': '/one' })
  )
  await expect(firstResponse.text()).resolves.toBe('original-response')

  originalSessions[0].close()
  await expect.poll(() => originalSessions[0].destroyed).toBe(true)

  const secondResponse = await toHttp2WebResponse(
    session.request({ ':path': '/two' })
  )
  await expect(secondResponse.text()).resolves.toBe('original-response')
  expect(originalSessions).toHaveLength(2)
})

it('closes the original connection once the client session closes', async () => {
  const originalSessionCloseListener = vi.fn()

  await using server = await createRawTestServer(() => {
    return http2
      .createServer((_request, response) => {
        response.end('original-response')
      })
      .on('session', (originalSession) => {
        originalSession.on('close', originalSessionCloseListener)
      })
  })

  {
    await using session = connectHttp2Session(server.http.url('/'))
    const response = await toHttp2WebResponse(session.request({ ':path': '/' }))
    await expect(response.text()).resolves.toBe('original-response')
  }

  await expect.poll(() => originalSessionCloseListener).toHaveBeenCalledOnce()
})
