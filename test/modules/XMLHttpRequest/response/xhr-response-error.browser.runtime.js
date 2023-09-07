import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ request }) => {
  request.respondWith(Response.error())
})

interceptor.apply()
