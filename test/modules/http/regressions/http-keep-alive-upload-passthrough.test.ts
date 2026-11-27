// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2831
 */
import axios from 'axios'
import { createTestHttpServer } from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('performs consecutive multipart uploads as-is on a kept-alive socket', async () => {
  await using httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.post('/upload', async ({ req }) => {
        const data = await req.formData()
        const file = data.get('file')

        if (!(file instanceof File)) {
          return new Response('Missing file', { status: 422 })
        }

        return Response.json({ name: file.name, size: file.size })
      })
    },
  })

  const client = axios.create({
    baseURL: httpServer.http.url('/').href,
    validateStatus: () => {
      return true
    },
  })

  const createUpload = () => {
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([new Uint8Array(4096)], { type: 'image/png' }),
      'picture.png'
    )

    return formData
  }

  const firstResponse = await client.post('/upload', createUpload())
  expect.soft(firstResponse.status).toBe(200)
  expect.soft(firstResponse.data).toEqual({ name: 'picture.png', size: 4096 })

  const secondResponse = await client.post('/upload', createUpload())
  expect.soft(secondResponse.status).toBe(200)
  expect.soft(secondResponse.data).toEqual({ name: 'picture.png', size: 4096 })

  const thirdResponse = await client.post('/upload', createUpload())
  expect.soft(thirdResponse.status).toBe(200)
  expect.soft(thirdResponse.data).toEqual({ name: 'picture.png', size: 4096 })

  const fourthResponse = await client.post('/upload', createUpload())
  expect.soft(fourthResponse.status).toBe(200)
  expect(fourthResponse.data).toEqual({ name: 'picture.png', size: 4096 })
})
