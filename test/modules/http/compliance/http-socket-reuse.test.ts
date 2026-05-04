// @vitest-environment node
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource/*', (req, res) => {
    res.status(200).send('original')
  })
  app.post('/resource/*', (req, res) => {
    res.status(200)
    req.pipe(res)
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()

  // Free open sockets between tests to scope reusing of the sockets to each test.
  Object.values(https.globalAgent.freeSockets).forEach((sockets) => {
    sockets?.forEach((socket) => socket.destroy())
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('allows reusing the same socket for mixed mocked/bypassed requests', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/mock')) {
      controller.respondWith(new Response(null, { status: 301 }))
    }
  })

  {
    const request = https.get(httpServer.https.url('/resource/one'), {
      rejectUnauthorized: false,
    })
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('original')
  }

  {
    /**
     * @note Performing a request to the same host with the same options
     * will trigger https.Agent to reuse the socket created for the first request.
     */
    const request = https.get(httpServer.https.url('/mock'), {
      rejectUnauthorized: false,
    })
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(301)
    await expect.soft(response.text()).resolves.toBe('')
  }
})

it('allows reusing the same socket for multiple mocked requests', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  {
    const request = https.get(httpServer.https.url('/mock'), {
      rejectUnauthorized: false,
    })
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('mocked')
  }

  {
    const request = https.get(httpServer.https.url('/mock'), {
      rejectUnauthorized: false,
    })
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('mocked')
  }
})

it('allows reusing the same socket for multiple bypassed requests', async () => {
  const requestListener = vi.fn()

  interceptor.on('request', ({ request }) => {
    requestListener(request)
  })

  {
    const request = https.get(httpServer.https.url('/resource/one'), {
      rejectUnauthorized: false,
    })
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('original')
    expect(requestListener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: 'GET',
        url: httpServer.https.url('/resource/one'),
      })
    )
  }

  {
    const request = https.request(httpServer.https.url('/resource/two'), {
      rejectUnauthorized: false,
      headers: { 'content-length': '6' },
    })
    request.write('second')
    request.end()
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('original')
    expect(requestListener).toHaveBeenCalledTimes(2)
    expect(requestListener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'GET',
        url: httpServer.https.url('/resource/two'),
      })
    )
  }
})

it('allows reusing the same socket for multiple bypassed requests with a body', async () => {
  const requestListener = vi.fn()

  interceptor.on('request', async ({ request }) => {
    requestListener(await request.text())
  })

  {
    const request = https.request(httpServer.https.url('/resource/one'), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      rejectUnauthorized: false,
    })
    request.write('first')
    request.end()
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('first')
    expect(requestListener).toHaveBeenCalledExactlyOnceWith('first')
  }

  {
    const request = https.request(httpServer.https.url('/resource/two'), {
      method: 'POST',
      rejectUnauthorized: false,
    })
    request.write('second')
    request.end()
    const [response] = await toWebResponse(request)

    expect.soft(response.status).toBe(200)
    await expect.soft(response.text()).resolves.toBe('second')
    expect(requestListener).toHaveBeenCalledTimes(2)
    expect(requestListener).toHaveBeenNthCalledWith(2, 'second')
  }
})
