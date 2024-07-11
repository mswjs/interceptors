/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { httpGet, PromisifiedResponse, useCors } from '../../helpers'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'

function arrayWith<V>(length: number, mapFn: (index: number) => V): V[] {
  return new Array(length).fill(null).map((_, index) => mapFn(index))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function parallelRequests(
  makeRequest: (index: number) => Promise<PromisifiedResponse>
) {
  return (index: number) => {
    return new Promise<PromisifiedResponse>((resolve) => {
      setTimeout(() => resolve(makeRequest(index)), randomBetween(100, 500))
    })
  }
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get<{ index: number }>('/number/:index', (req, res) => {
    return res.send(`real ${req.params.index}`)
  })
})

const interceptor = new ClientRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/user')) {
    const id = url.searchParams.get('id')
    controller.respondWith(new Response(`mocked ${id}`))
  }
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it.skip('returns responses for 500 matching parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests((i) => httpGet(httpServer.http.url(`/user?id=${i + 1}`)))
    )
  )
  const bodies = responses.map((response) => response.resBody)
  const expectedBodies = arrayWith(500, (i) => `mocked ${i + 1}`)

  expect(bodies).toEqual(expectedBodies)
})

it.skip('returns responses for 500 bypassed parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests((i) => httpGet(httpServer.http.url(`/number/${i + 1}`)))
    )
  )
  const bodies = responses.map((response) => response.resBody)
  const expectedBodies = arrayWith(500, (i) => `real ${i + 1}`)

  expect(bodies).toEqual(expectedBodies)
})
