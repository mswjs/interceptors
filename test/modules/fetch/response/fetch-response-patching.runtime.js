import { FetchInterceptor } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', async (request) => {
  if (request.url.pathname === '/mocked') {
    await new Promise((resolve) => setTimeout(resolve, 0))

    const originalResponse = await fetch(window.originalUrl)
    const originalText = await originalResponse.text()

    request.respondWith({
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: {
        'X-Custom-Header':
          originalResponse.headers.get('X-Custom-Header') || '',
      },
      body: `${originalText} world`,
    })
  }
})

interceptor.apply()

window.interceptor = interceptor
