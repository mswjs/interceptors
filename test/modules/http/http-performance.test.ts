// @vitest-environment node
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { toWebResponse } from '#/test/helpers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

function arrayWith<V>(length: number, mapFn: (index: number) => V): V[] {
  return new Array(length).fill(null).map((_, index) => mapFn(index))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function parallelRequests(makeRequest: (index: number) => Promise<Response>) {
  return (index: number) => {
    return new Promise<Response>((resolve) => {
      setTimeout(() => resolve(makeRequest(index)), randomBetween(100, 500))
    })
  }
}

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/user')) {
    const id = url.searchParams.get('id')
    controller.respondWith(new Response(`mocked ${id}`))
  }
})

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/number/:index', (ctx) => {
        return new Response(`real ${ctx.req.param('index')}`)
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it.skip('returns responses for 500 matching parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests(async (i) => {
        const [response] = await toWebResponse(
          http.get(httpServer.http.url(`/user?id=${i + 1}`).href)
        )
        return response
      })
    )
  )
  const bodies = responses.map((response) => response.text())
  const expectedBodies = arrayWith(500, (i) => `mocked ${i + 1}`)

  await expect(Promise.all(bodies)).resolves.toEqual(expectedBodies)
})

it.skip('returns responses for 500 bypassed parallel requests', async () => {
  const responses = await Promise.all(
    arrayWith(
      500,
      parallelRequests(async (i) => {
        const [response] = await toWebResponse(
          http.get(httpServer.http.url(`/number/${i + 1}`).href)
        )
        return response
      })
    )
  )
  const bodies = responses.map((response) => response.text())
  const expectedBodies = arrayWith(500, (i) => `real ${i + 1}`)

  await expect(Promise.all(bodies)).resolves.toEqual(expectedBodies)
})
