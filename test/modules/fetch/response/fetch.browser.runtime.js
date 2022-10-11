import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', (request) => {
  const { serverHttpUrl, serverHttpsUrl } = window

  if ([serverHttpUrl, serverHttpsUrl].includes(request.url.href)) {
    request.respondWith(
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
