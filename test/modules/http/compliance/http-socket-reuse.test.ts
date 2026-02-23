// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/get', (req, res) => {
    res.status(200).send('original')
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
    const request = https.get(httpServer.https.url('/get'), {
      rejectUnauthorized: false,
    })
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(200)
    await expect.soft(text()).resolves.toBe('original')
  }

  {
    /**
     * @note Performing a request to the same host with the same options
     * will trigger https.Agent to reuse the socket created for the first request.
     */
    const request = https.get(httpServer.https.url('/mock'), {
      rejectUnauthorized: false,
    })
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(301)
    await expect.soft(text()).resolves.toBe('')
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
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(200)
    await expect.soft(text()).resolves.toBe('mocked')
  }

  {
    const request = https.get(httpServer.https.url('/mock'), {
      rejectUnauthorized: false,
    })
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(200)
    await expect.soft(text()).resolves.toBe('mocked')
  }
})

it('allows reusing the same socket for multiple bypassed requests', async () => {
  {
    const request = https.get(httpServer.https.url('/get'), {
      rejectUnauthorized: false,
    })
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(200)
    await expect.soft(text()).resolves.toBe('original')
  }

  {
    const request = https.get(httpServer.https.url('/get'), {
      rejectUnauthorized: false,
    })
    const { res, text } = await waitForClientRequest(request)

    expect.soft(res.statusCode).toBe(200)
    await expect.soft(text()).resolves.toBe('original')
  }
})
