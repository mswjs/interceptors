import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', (request) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: {
        id: request.id,
        method: request.method,
        url: request.url.href,
        headers: request.headers.all(),
        credentials: request.credentials,
        body: request.text(),
      },
    })
  )
})

interceptor.apply()
