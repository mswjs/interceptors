// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/original', (req, res) =>
    res.writeHead(302, { Location: httpServer.http.url('/redirected') }).end()
  )
  app.get('/redirected', (req, res) => res.send('redirected'))
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('follows a bypassed redirect response', async () => {
  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  expect(response.redirected).toBe(true)
  await expect(response.text()).resolves.toBe('redirected')
})

it('follows a mocked redirect to the original server', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 302)
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  expect(response.redirected).toBe(true)
  await expect(response.text()).resolves.toBe('redirected')
})

it('follows a mocked relative redirect to the original server', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        new Response(null, { status: 302, headers: { location: '/redirected' } })
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  expect(response.redirected).toBe(true)
  await expect(response.text()).resolves.toBe('redirected')
})

it('follows a mocked redirect to a mocked response', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 302)
      )
    }

    if (request.url.endsWith('/redirected')) {
      return controller.respondWith(new Response('mocked response'))
    }
  })

  const response = await fetch(httpServer.http.url('/original'))

  expect(response.status).toBe(200)
  expect(response.redirected).toBe(true)
  await expect(response.text()).resolves.toBe('mocked response')
})

it('returns the redirect response as-is for a request with "manual" redirect mode', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 301)
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'), {
    redirect: 'manual',
  })

  expect(response.status).toBe(301)
  expect(response.redirected).toBe(false)
  expect(response.headers.get('location')).toBe(
    httpServer.http.url('/redirected')
  )
})

it('throws a network error on a redirect for a request with "error" redirect mode', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 301)
      )
    }
  })

  await expect(
    fetch(httpServer.http.url('/original'), {
      redirect: 'error',
    })
  ).rejects.toThrow('Failed to fetch')
})

it('throws a network error on a non-303 redirect with a body', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect(httpServer.http.url('/redirected'), 301)
      )
    }
  })

  await expect(
    fetch(httpServer.http.url('/original'), {
      method: 'POST',
      body: 'hello world',
    })
  ).rejects.toThrow('Failed to fetch')
})

it('throws a network error on redirects to a non-HTTP scheme', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(Response.redirect('wss://localhost', 302))
    }
  })

  await expect(fetch(httpServer.http.url('/original'))).rejects.toThrow(
    'Failed to fetch'
  )
})

it('throws on a redirect with credentials for a "cors" request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('http://user:password@localhost', 302)
      )
    }
  })

  await expect(
    fetch(httpServer.http.url('/original'), { mode: 'cors' })
  ).rejects.toThrow('Failed to fetch')
})

it('coerces a 301/302 redirect for a POST request to a GET request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('http://localhost/redirected', 301)
      )
    }

    if (request.method === 'GET' && request.url.endsWith('/redirected')) {
      // Infer response body from the request body.
      return controller.respondWith(
        new Response(request.clone().body, { headers: request.headers })
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'), {
    method: 'POST',
    headers: {
      'content-language': 'en-US',
      'content-location': 'http://localhost/redirected',
      'content-type': 'application/json',
      'content-length': '0',
      'x-other-header': 'value',
    },
  })

  expect(response.status).toBe(200)
  // Must remove body-related request headers.
  expect(Array.from(response.headers)).toEqual([['x-other-header', 'value']])
  // Non-GET/HEAD request body of a 303 redirect must be null.
  expect(response.body).toBeNull()
})

it('coerces a 303 redirect to a non-HEAD/GET request to a GET request', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('http://localhost/redirected', 303)
      )
    }

    if (request.method === 'GET' && request.url.endsWith('/redirected')) {
      // Infer response body from the request body.
      return controller.respondWith(
        new Response(request.clone().body, { headers: request.headers })
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'), {
    method: 'POST',
    headers: {
      'content-language': 'en-US',
      'content-location': 'http://localhost/redirected',
      'content-type': 'application/json',
      'content-length': '0',
      'x-other-header': 'value',
    },
  })

  expect(response.status).toBe(200)
  // Must remove body-related request headers.
  expect(Array.from(response.headers)).toEqual([['x-other-header', 'value']])
  // Non-GET/HEAD request body of a 303 redirect must be null.
  expect(response.body).toBeNull()
})

it('deletes sensitive request headers for a cross-origin redirect', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.url.endsWith('/original')) {
      return controller.respondWith(
        Response.redirect('https://example.com/redirected', 303)
      )
    }

    if (request.url.endsWith('/redirected')) {
      return controller.respondWith(
        new Response(null, { headers: request.headers })
      )
    }
  })

  const response = await fetch(httpServer.http.url('/original'), {
    headers: {
      authorization: 'Bearer TOKEN',
      'proxy-authorization': 'Bearer PROXY_TOKEN',
      cookie: 'a=1',
      host: 'localhost',
      'x-other-header': 'value',
    },
  })

  expect(response.status).toBe(200)
  expect(Array.from(response.headers)).toEqual([['x-other-header', 'value']])
  expect(response.body).toBeNull()
})
