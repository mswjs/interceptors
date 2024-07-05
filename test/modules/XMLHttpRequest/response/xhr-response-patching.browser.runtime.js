import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', async ({ request, requestId, controller }) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: {
        id: requestId,
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        credentials: request.credentials,
        body: await request.clone().text(),
      },
    })
  )

  const url = new URL(request.url)

  if (url.pathname === '/mocked') {
    await new Promise((resolve) => setTimeout(resolve, 0))

    const req = new XMLHttpRequest()
    req.open('GET', window.originalUrl, true)
    req.send()
    await new Promise((resolve, reject) => {
      req.addEventListener('loadend', resolve)
      req.addEventListener('error', reject)
    })

    controller.respondWith(
      new Response(`${req.responseText} world`, {
        status: req.status,
        statusText: req.statusText,
        headers: {
          'X-Custom-Header': req.getResponseHeader('X-Custom-Header'),
        },
      })
    )
  }
})

interceptor.apply()

window.interceptor = interceptor
