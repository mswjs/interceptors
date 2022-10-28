import { SendBeaconInterceptor } from '@mswjs/interceptors/lib/interceptors/sendBeacon'

const interceptor = new SendBeaconInterceptor()
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
})

interceptor.apply()
