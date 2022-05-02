import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = new FetchInterceptor()
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
})

interceptor.apply()
