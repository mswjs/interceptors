/**
 * @jest-environment node
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { interceptClientRequest } from '../../../src/interceptors/ClientRequest'
import { httpGet, PromisifiedResponse } from '../../helpers'

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

let httpServer: ServerApi
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver(event) {
    const { request } = event

    if (request.url.pathname.startsWith('/user')) {
      const id = request.url.searchParams.get('id')

      event.respondWith({
        status: 200,
        body: `mocked ${id}`,
      })
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get<{ index: number }>('/number/:index', (req, res) => {
      return res.send(`real ${req.params.index}`)
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('returns responses for 500 matching parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests((i) =>
        httpGet(httpServer.http.makeUrl(`/user?id=${i + 1}`))
      )
    )
  )
  const bodies = responses.map((response) => response.resBody)
  const expectedBodies = arrayWith(500, (i) => `mocked ${i + 1}`)

  expect(bodies).toEqual(expectedBodies)
})

test('returns responses for 500 bypassed parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests((i) =>
        httpGet(httpServer.http.makeUrl(`/number/${i + 1}`))
      )
    )
  )
  const bodies = responses.map((response) => response.resBody)
  const expectedBodies = arrayWith(500, (i) => `real ${i + 1}`)

  expect(bodies).toEqual(expectedBodies)
})
