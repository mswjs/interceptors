import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '.'
import { toWebResponse } from '../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
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

it('abort the request if the abort signal is emitted', async () => {
  const requestUrl = httpServer.http.url('/')

  interceptor.on('request', async function delayedResponse({ controller }) {
    await setTimeout(1000)
    controller.respondWith(new Response())
  })

  const abortController = new AbortController()
  const request = http.get(requestUrl, { signal: abortController.signal })

  abortController.abort()

  const abortErrorPromise = new DeferredPromise<Error>()
  request.on('error', function (error) {
    abortErrorPromise.resolve(error)
  })

  const abortError = await abortErrorPromise
  expect(abortError.name).toBe('AbortError')

  expect(request.destroyed).toBe(true)
})

it('patch the Headers object correctly after dispose and reapply', async () => {
  interceptor.dispose()
  interceptor.apply()

  interceptor.on('request', ({ controller }) => {
    const headers = new Headers({
      'X-CustoM-HeadeR': 'Yes',
    })
    controller.respondWith(new Response(null, { headers }))
  })

  const request = http.get(httpServer.http.url('/'))
  const [response, rawResponse] = await toWebResponse(request)

  expect(rawResponse.rawHeaders).toEqual(
    expect.arrayContaining(['X-CustoM-HeadeR', 'Yes'])
  )
  expect(response.headers.get('x-custom-header')).toBe('Yes')
})
