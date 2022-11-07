/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const server = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res
      .set({
        // Explicitly allow for this custom header to be
        // exposed on the response. Otherwise it's ignored.
        'Access-Control-Expose-Headers': 'x-appended-header',
        'X-Appended-Header': req.headers['x-appended-header'],
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
  interceptor.on('request', (request) => {
    request.headers.set('X-Appended-Header', 'modified')
  })

  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.url('/user'))
    req.send()
  })

  expect(req.getResponseHeader('x-appended-header')).toBe('modified')
})
