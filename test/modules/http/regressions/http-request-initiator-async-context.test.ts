// @vitest-environment node
import http from 'node:http'
import { Readable } from 'node:stream'
import axios from 'axios'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { toWebResponse } from '#/test/helpers'

/**
 * @note Use the `ClientRequestInterceptor` on purpose: its forwarding
 * predicate relies on the request initiator (`http.ClientRequest`).
 * If the initiator is lost, the "request" event is never forwarded
 * and the request passes through (here, to a non-existent server).
 */
const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a request whose body is piped from a foreign async context', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  // Create the request body stream outside of the request
  // async context (e.g. a form-data stream created by the consumer).
  const bodyStream = new Readable({
    read() {},
  })

  const request = http.request('http://localhost/upload', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
    },
  })
  bodyStream.pipe(request)

  // Push the request body from a foreign async context as well.
  // This makes the request headers and body reach the socket outside
  // of the async context established by the request interception.
  setTimeout(() => {
    bodyStream.push('hello world')
    bodyStream.push(null)
  }, 0)

  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked')
})

it('intercepts an axios upload request with form data', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    const data = await request.formData()
    const file = data.get('file')

    if (!(file instanceof File)) {
      controller.respondWith(new Response('Missing file', { status: 400 }))
      return
    }

    controller.respondWith(
      Response.json({
        name: file.name,
        content: await file.text(),
      })
    )
  })

  const formData = new FormData()
  const file = new Blob(['Hello', 'world'], { type: 'text/plain' })
  formData.set('file', file, 'doc.txt')

  const response = await axios.post('https://localhost/upload', formData)

  expect(response.data).toEqual({
    name: 'doc.txt',
    content: 'Helloworld',
  })
})
