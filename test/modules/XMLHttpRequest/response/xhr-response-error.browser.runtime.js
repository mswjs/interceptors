import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ controller }) => {
  controller.respondWith(Response.error())
})

interceptor.apply()
