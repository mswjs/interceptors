import { SendBeaconInterceptor } from '@mswjs/interceptors/lib/interceptors/sendBeacon'

// Dispatch a `pure-beacon` event before calling `sendBeacon`
// to make sure we are calling the original sendBeacon.
// This needs to be done before we apply the interceptor
// to ensure it will be used instead of the original version.
const pureSendBeacon = navigator.sendBeacon
navigator.sendBeacon = (url, data) => {
  window.dispatchEvent(
    new CustomEvent('pure-beacon', {
      detail: {
        url,
        data,
      },
    })
  )
  pureSendBeacon(url, data)
}

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
