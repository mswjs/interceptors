import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FetchInterceptor } from '.'
import { sleep } from '../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (_req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (_req, res) => {
    res.status(200).send('/get')
  })
})

const interceptor = new FetchInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})


it('abort pending requests when manually aborted', async () => {
  const requestUrl = httpServer.http.url('/')

  interceptor.on('request', async function requestListener() {
    expect.fail('request should never be received')
  })

  const controller = new AbortController()
  const requestAborted = new DeferredPromise<void>()

  const request = fetch(requestUrl, { signal: controller.signal })
  request.catch((err) => {
    expect(err.cause.name).toEqual('AbortError')
    requestAborted.resolve()
  })

  controller.abort()

  await requestAborted
})

it('abort ongoing requests when manually aborted', async () => {
  const requestUrl = httpServer.http.url('/')

  const requestEmitted = new DeferredPromise<void>()
  interceptor.on('request', async function requestListener({ request }) {
    requestEmitted.resolve()
    await sleep(10000)
    request.respondWith(new Response())
  })

  const controller = new AbortController()
  const request = fetch(requestUrl, { signal: controller.signal })

  const requestAborted = new DeferredPromise<void>()

  request.catch((err) => {
    expect(err.cause.name).toEqual('AbortError')
    requestAborted.resolve()
  })

  await requestEmitted

  controller.abort()

  await requestAborted
})