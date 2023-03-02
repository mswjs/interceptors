import { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { Page, Response } from '@playwright/test'
import { test, expect } from '../../../playwright.extend'
import { extractRequestFromPage, useCors } from '../../../helpers'

const EXAMPLE_PATH = require.resolve('./fetch.browser.runtime.js')

const httpServer = new HttpServer((app) => {
  app.use(useCors)

  const handleRequest: RequestHandler = (_req, res) => {
    res.status(200).send('user-body').end()
  }

  app.get('/user', handleRequest)
  app.post('/user', handleRequest)
  app.put('/user', handleRequest)
  app.delete('/user', handleRequest)
  app.patch('/user', handleRequest)
  app.head('/user', handleRequest)
})

async function callFetch(
  page: Page,
  url: string,
  init: RequestInit = {}
): Promise<[Request, Response]> {
  return Promise.all([
    extractRequestFromPage(page),
    new Promise<Response>(async (resolve) => {
      page.evaluate(([url, init]) => fetch(url, init), [url, init] as [
        string,
        RequestInit
      ])

      resolve(page.waitForResponse(url))
    }),
  ])
}

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterAll(async () => {
  await httpServer.close()
})

test.describe('HTTP', () => {
  test('intercepts an HTTP GET request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.http.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request.method).toBe('GET')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.text()).toBe('')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP POST request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.http.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'post' }),
    })

    expect(request.method).toBe('POST')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'post' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP PUT request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.http.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'put' }),
    })

    expect(request.method).toBe('PUT')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'put' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP PATCH request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.http.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'patch' }),
    })

    expect(request.method).toBe('PATCH')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'patch' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTP DELETE request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.http.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'delete' }),
    })

    expect(request.method).toBe('DELETE')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'delete' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })
})

test.describe('HTTPS', () => {
  test('intercepts an HTTPS GET request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.https.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      headers: {
        'x-custom-header': 'yes',
      },
    })

    expect(request.method).toBe('GET')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.text()).toBe('')

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS POST request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.https.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'POST',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'post' }),
    })

    expect(request.method).toBe('POST')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'post' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS PUT request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.https.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'PUT',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'put' }),
    })

    expect(request.method).toBe('PUT')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'put' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS PATCH request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.https.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'PATCH',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'patch' }),
    })

    expect(request.method).toBe('PATCH')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'patch' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })

  test('intercepts an HTTPS DELETE request', async ({ loadExample, page }) => {
    await loadExample(EXAMPLE_PATH)

    const url = httpServer.https.url('/user?id=123')
    const [request, response] = await callFetch(page, url, {
      method: 'DELETE',
      headers: {
        'x-custom-header': 'yes',
      },
      body: JSON.stringify({ body: 'delete' }),
    })

    expect(request.method).toBe('DELETE')
    expect(request.url).toBe(url)
    expect(request.headers.get('x-custom-header')).toBe('yes')
    expect(request.credentials).toBe('same-origin')
    expect(await request.json()).toEqual({ body: 'delete' })

    expect(response.status()).toBe(200)
    expect(response.statusText()).toBe('OK')
    expect(await response.text()).toBe('user-body')
  })
})

test('sets "credentials" to "include" on the isomorphic request when fetch sets it to "include"', async ({
  loadExample,
  page,
}) => {
  await loadExample(EXAMPLE_PATH)

  const url = httpServer.https.url('/user')
  const [request] = await callFetch(page, url, {
    mode: 'no-cors',
    credentials: 'include',
  })

  expect(request.credentials).toBe('include')
})

test('sets "credentials" to "omit" on the isomorphic request when fetch sets it to "omit"', async ({
  loadExample,
  page,
}) => {
  await loadExample(EXAMPLE_PATH)

  const url = httpServer.http.url('/user')
  const [request] = await callFetch(page, url, {
    credentials: 'omit',
  })

  expect(request.credentials).toBe('omit')
})
