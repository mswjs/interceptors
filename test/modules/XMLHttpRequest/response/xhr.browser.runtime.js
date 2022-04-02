import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: JSON.stringify({
        id: request.id,
        method: request.method,
        url: request.url.href,
        headers: request.headers.all(),
        credentials: request.credentials,
        body: request.body,
      }),
    })
  )

  const { serverHttpUrl, serverHttpsUrl } = window

  if ([serverHttpUrl, serverHttpsUrl].includes(request.url.href)) {
    request.respondWith({
      status: 201,
      statusText: 'Created',
      headers: {
        'Content-Type': 'application/hal+json',
      },
      body: JSON.stringify({ mocked: true }),
    })
  }
})

interceptor.apply()

window.interceptor = interceptor
