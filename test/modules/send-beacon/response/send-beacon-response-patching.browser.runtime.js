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
  if (request.url.pathname === '/mocked') {
    await new Promise((resolve) => setTimeout(resolve, 0))

    request.respondWith({ status: 204 })
  }
})

interceptor.apply()

window.interceptor = interceptor
