/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

// The actual server is here for A/B purpose only.
const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.writeHead(200, { 'X-CustoM-HeadeR': 'Yes' })
    res.end()
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('preserves raw response headers (object init)', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: {
          'X-CustoM-HeadeR': 'Yes',
        },
      })
    )
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})

it('preserves raw response headers (array init)', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(null, {
        headers: [['X-CustoM-HeadeR', 'Yes']],
      })
    )
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})

it('preserves raw response headers (set after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: { 'X-CustoM-HeadeR': 'Yes' },
    })
    response.headers.set('x-My-Header', '1')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes', 'x-My-Header', '1'])
  )
  expect(res.headers).toStrictEqual({
    'x-custom-header': 'Yes',
    'x-my-header': '1',
  })
})

it('preserves raw response headers (append after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: { 'X-CustoM-HeadeR': 'Yes' },
    })
    response.headers.append('x-my-header', '1')
    response.headers.append('x-My-Header', '2')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining([
      'X-CustoM-HeadeR',
      'Yes',
      'x-my-header',
      '1',
      'x-My-Header',
      '2',
    ])
  )
  expect(res.headers).toStrictEqual({
    'x-custom-header': 'Yes',
    'x-my-header': '1, 2',
  })
})

it('preserves raw response headers (delete after init)', async () => {
  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      headers: {
        'X-CustoM-HeadeR': 'Yes',
        'x-My-Header': '1',
        'x-my-header': '2',
      },
    })
    response.headers.delete('x-my-header')

    controller.respondWith(response)
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers).toStrictEqual({
    'x-custom-header': 'Yes',
  })
})

it('preserves raw response headers (standalone Headers)', async () => {
  interceptor.on('request', ({ controller }) => {
    const headers = new Headers({
      'X-CustoM-HeadeR': 'Yes',
    })
    controller.respondWith(new Response(null, { headers }))
  })

  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers).toStrictEqual({ 'x-custom-header': 'Yes' })
})

it('preserves raw response headers for unmocked request', async () => {
  const request = http.get(httpServer.http.url('/'))
  const { res } = await waitForClientRequest(request)

  expect(res.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(res.headers['x-custom-header']).toEqual('Yes')
})
