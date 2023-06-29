import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()

interceptor.on('request', async ({ request }) => {
  const url = new URL(request.url)

  if (url.pathname === '/mocked') {
    await new Promise((resolve) => setTimeout(resolve, 0))

    const originalResponse = await fetch(window.originalUrl)
    const originalText = await originalResponse.text()

    request.respondWith(new Response(`${originalText} world`, originalResponse))
  }
})

interceptor.apply()

window.interceptor = interceptor
