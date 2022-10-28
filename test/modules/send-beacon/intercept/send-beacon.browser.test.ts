/**
 * @jest-environment node
 */
import * as path from 'path'
import { HttpServer } from '@open-draft/test-server/http'
import { pageWith, ScenarioApi } from 'page-with'
import { extractRequestFromPage } from '../../../helpers'
import { IsomorphicRequest } from '../../../../src'
import { PageFunction } from 'playwright-core/types/structs'

const httpServer = new HttpServer((app) => {
  app.get('/ping', (_req, res) => {
    res.sendStatus(204)
  })
})

function prepareRuntime() {
  return pageWith({
    example: path.resolve(__dirname, 'send-beacon.browser.runtime.js'),
  })
}

async function callSendBeacon(
  context: ScenarioApi,
  url: string,
  data?: BodyInit | null
): Promise<[IsomorphicRequest, boolean]> {
  return Promise.all([
    extractRequestFromPage(context.page),
    context.page.evaluate(
      ({ url, data }) => {
        return navigator.sendBeacon(url, data)
      },
      { url, data }
    ),
  ])
}

/**
 * `FormData`, `Blob` are not natively supported by Node <18
 * Use this instead of `callSendBeacon` for those cases to
 * create the payload inside the browser context.
 */
async function evalAndWaitForRequest<Arg>(
  context: ScenarioApi,
  evalFunc: PageFunction<Arg, boolean>,
  args: Arg
): Promise<[IsomorphicRequest, boolean]> {
  return Promise.all([
    extractRequestFromPage(context.page),
    context.page.evaluate(evalFunc, args),
  ])
}

beforeAll(async () => {
  await httpServer.listen()
})

afterAll(async () => {
  await httpServer.close()
})

test('intercepts a sendBeacon call', async () => {
  const context = await prepareRuntime()
  const url = httpServer.http.url('/ping')
  const [request, returnValue] = await callSendBeacon(context, url, 'test')

  expect(request.method).toEqual('POST')
  expect(request.url.href).toEqual(url)
  expect(request.headers.get('content-type')).toEqual(
    'text/plain;charset=UTF-8'
  )
  expect(request.credentials).toEqual('include')
  expect(await request.text()).toEqual('test')

  expect(returnValue).toBe(true)
})

describe('sets the correct request mime type', () => {
  test('for blobs with defined type', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.url('/ping')

    const [request] = await evalAndWaitForRequest(
      context,
      ({ url }: { url: string }) => {
        const encodedText = new TextEncoder().encode('test')
        const blob = new Blob([encodedText], {
          type: 'text/plain;charset=UTF-8',
        })
        return navigator.sendBeacon(url, blob)
      },
      { url }
    )

    expect(request.headers.get('content-type')).toBe('text/plain;charset=utf-8')
    expect(await request.text()).toBe('test')
  })

  test('for blobs with undefined type', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.url('/ping')

    const [request] = await evalAndWaitForRequest(
      context,
      ({ url }: { url: string }) => {
        const encodedText = new TextEncoder().encode('test')
        const blob = new Blob([encodedText])
        return navigator.sendBeacon(url, blob)
      },
      { url }
    )

    expect(request.headers.get('content-type')).toBe(null)
    expect(await request.text()).toBe('test')
  })

  test('for strings', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.url('/ping')

    const [request] = await callSendBeacon(context, url, 'test')

    expect(request.headers.get('content-type')).toBe('text/plain;charset=UTF-8')
    expect(await request.text()).toBe('test')
  })

  test('for URLSearchParams', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.url('/ping')

    const [request] = await evalAndWaitForRequest(
      context,
      ({ url }: { url: string }) => {
        const searchParams = new URLSearchParams('test=test')
        return navigator.sendBeacon(url, searchParams)
      },
      { url }
    )

    expect(request.headers.get('content-type')).toBe(
      'application/x-www-form-urlencoded;charset=UTF-8'
    )
    expect(await request.text()).toBe('test=test')
  })

  test('for FormData', async () => {
    const context = await prepareRuntime()
    const url = httpServer.http.url('/ping')

    const [request] = await evalAndWaitForRequest(
      context,
      ({ url }: { url: string }) => {
        const formData = new FormData()
        return navigator.sendBeacon(url, formData)
      },
      { url }
    )

    expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data/)
  })
})
