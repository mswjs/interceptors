import { BatchInterceptor } from '@mswjs/interceptors'
import browserInterceptors from '@mswjs/interceptors/presets/browser'

const interceptor = new BatchInterceptor({
  name: 'browser-preset-interceptor',
  interceptors: browserInterceptors,
})

interceptor.apply()

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

  controller.respondWith(new Response('mocked'))
})
