import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

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

  const { serverHttpUrl, serverHttpsUrl } = window

  if ([serverHttpUrl, serverHttpsUrl].includes(request.url)) {
    controller.respondWith(
      new Response(JSON.stringify({ mocked: true }), {
        status: 201,
        statusText: 'Created',
        headers: {
          'Content-Type': 'application/hal+json',
        },
      })
    )
  }
})

interceptor.apply()

window.interceptor = interceptor
