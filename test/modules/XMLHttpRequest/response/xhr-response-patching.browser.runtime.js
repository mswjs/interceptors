import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', async (request) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: {
        id: request.id,
        method: request.method,
        url: request.url.href,
        headers: request.headers.all(),
        credentials: request.credentials,
        body: await request.text(),
      },
    })
  )

  if (request.url.pathname === '/mocked') {
    await new Promise((resolve) => setTimeout(resolve, 0))

    const req = new XMLHttpRequest()
    req.open('GET', window.originalUrl, true)
    req.send()
    await new Promise((resolve, reject) => {
      req.addEventListener('loadend', resolve)
      req.addEventListener('error', reject)
    })

    request.respondWith({
      status: req.status,
      statusText: req.statusText,
      headers: {
        'X-Custom-Header': req.getResponseHeader('X-Custom-Header'),
      },
      body: `${req.responseText} world`,
    })
  }
})

interceptor.apply()

window.interceptor = interceptor
