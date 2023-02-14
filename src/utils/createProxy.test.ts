/**
 * @jest-environment jsdom
 */
import { createXMLHttpRequestProxy } from '../interceptors/XMLHttpRequest/XMLHttpRequestProxy'

it('creates a proxy', (done) => {
  const XMLHttpRequestProxy = createXMLHttpRequestProxy()
  const request = new XMLHttpRequestProxy()
  request.addEventListener('load', function () {
    expect(this.status).toBe(301)
    done()
  })

  request.open('GET', 'https://httpbin.org/get')
  request.send()
})
