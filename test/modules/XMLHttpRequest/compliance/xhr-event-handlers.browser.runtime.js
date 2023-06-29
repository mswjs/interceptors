import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', async ({ request, requestId }) => {
  window.dispatchEvent(
    new CustomEvent('resolver', {
      detail: {
        id: requestId,
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        credentials: request.credentials,
        body: await request.text(),
      },
    })
  )
})

interceptor.apply()
