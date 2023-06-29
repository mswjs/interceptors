// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'

const server = new HttpServer((app) => {
  app.use(useCors)
  app.get('/user', (req, res) => {
    res
      .set({
        // Explicitly allow for this custom header to be
        // exposed on the response. Otherwise it's ignored.
        'Access-Control-Expose-Headers': [
          'x-delete-header',
          'x-append-header',
          'x-set-header',
        ],
        'X-Delete-Header': req.headers['x-delete-header'],
        'X-Append-Header': req.headers['x-append-header'],
        'X-Set-Header': req.headers['x-set-header'],
      })
      .end()
  })
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => void 0)
  await server.listen()
  interceptor.apply()
})

afterAll(async () => {
  vi.restoreAllMocks()
  await server.close()
  interceptor.dispose()
})

it('allows modifying outgoing request headers', async () => {
  interceptor.on('request', ({ request }) => {
    request.headers.delete('X-Delete-Header')
    request.headers.append('X-Append-Header', '2')
    request.headers.set('X-Set-Header', 'new-value')
  })

  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.url('/user'))
    req.setRequestHeader('X-Delete-Header', 'a')
    req.setRequestHeader('X-Append-Header', '1')
    req.send()
  })

  // Cannot delete XMLHttpRequest headers.
  expect(req.getResponseHeader('x-delete-header')).toBe('a')
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringMatching(
      `XMLHttpRequest: Cannot remove a "X-Delete-Header" header from the Fetch API representation of the "GET http://127.0.0.1:\\d+/user" request. XMLHttpRequest headers cannot be removed.`
    )
  )

  // Adding and modifying XMLHttpRequest headers is allowed.
  expect(req.getResponseHeader('x-append-header')).toBe('1, 2')
  expect(req.getResponseHeader('x-set-header')).toBe('new-value')
})
