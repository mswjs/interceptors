import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', (request) => {
  const { serverHttpUrl, serverHttpsUrl } = window

  if ([serverHttpUrl, serverHttpsUrl].includes(request.url.href)) {
    request.respondWith({
      status: 201,
      headers: {
        'Content-Type': 'application/hal+json',
      },
      body: JSON.stringify({ mocked: true }),
    })
  }
})

interceptor.apply()

window.interceptor = interceptor
