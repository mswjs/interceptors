// @vitest-environment happy-dom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

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
  await server.listen()
  interceptor.apply()
})

afterAll(async () => {
  await server.close()
  interceptor.dispose()
})

it('allows modifying outgoing request headers', async () => {
  interceptor.on('request', ({ request }) => {
    if (request.method === 'OPTIONS') {
      return
    }

    request.headers.delete('X-Delete-Header')
    request.headers.append('X-Append-Header', '2')
    request.headers.set('X-Set-Header', 'new-value')
  })

  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/user'))
  request.setRequestHeader('X-Delete-Header', 'a')
  request.setRequestHeader('X-Append-Header', '1')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(
      request.getResponseHeader('x-delete-header'),
      'XMLHttpRequest headers cannot be deleted'
    )
    .toBe('a')
  expect
    .soft(
      request.getResponseHeader('x-append-header'),
      'Appends a new header value'
    )
    .toBe('1, 2')
  expect
    .soft(request.getResponseHeader('x-set-header'), 'Replace a header value')
    .toBe('new-value')
})
