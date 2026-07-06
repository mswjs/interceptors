// @vitest-environment happy-dom
/**
 * @see https://github.com/mswjs/interceptors/issues/573
 */
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import {
  spyOnXMLHttpRequestUpload,
  waitForXMLHttpRequest,
} from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

type UploadScenario = [
  bodyName: string,
  createBody: () => XMLHttpRequestBodyInit,
  totalBytes: number,
]

const uploadScenarios: Array<UploadScenario> = [
  [
    'a plain string',
    () => {
      return 'hello world'
    },
    11,
  ],
  [
    'a Blob',
    () => {
      return new Blob(['hello world'])
    },
    11,
  ],
  [
    'URLSearchParams',
    () => {
      return new URLSearchParams({ hello: 'world' })
    },
    11,
  ],
  [
    'FormData (single file)',
    () => {
      const data = new FormData()
      data.set('data', new File(['hello world'], 'data.txt'))
      return data
    },
    207,
  ],
  [
    'FormData (multiple files)',
    () => {
      const data = new FormData()
      data.set('file1', new File(['hello world'], 'hello.txt'))
      data.set('file2', new File(['goodbye cosm'], 'goodbye.txt'))
      return data
    },
    377,
  ],
]

it.for(uploadScenarios)(
  'supports uploading %s to the original server',
  async ([, createBody, totalBytes], { task }) => {
    const request = new XMLHttpRequest()
    const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
    request.open('POST', server.http.url('/upload'))
    request.send(createBody())

    await waitForXMLHttpRequest(request)

    expect.soft(request.status).toBe(200)

    if (task.file.projectName === 'browser') {
      expect(uploadEvents).toEqual([
        ['loadstart', { loaded: 0, total: totalBytes }],
        ['progress', { loaded: totalBytes, total: totalBytes }],
        ['load', { loaded: totalBytes, total: totalBytes }],
        ['loadend', { loaded: totalBytes, total: totalBytes }],
      ])
    }
  }
)

it.for(uploadScenarios)(
  'supports uploading %s to a mocked server',
  async ([, createBody, totalBytes], { task }) => {
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(
        new Response(null, {
          headers: { 'access-control-allow-origin': '*' },
        })
      )
    })

    const request = new XMLHttpRequest()
    const { events: uploadEvents } = spyOnXMLHttpRequestUpload(request.upload)
    request.open('POST', server.http.url('/upload'))
    request.send(createBody())

    await waitForXMLHttpRequest(request)

    expect.soft(request.status).toBe(200)

    if (task.file.projectName === 'browser') {
      expect(uploadEvents).toEqual([
        ['loadstart', { loaded: 0, total: totalBytes }],
        ['progress', { loaded: totalBytes, total: totalBytes }],
        ['load', { loaded: totalBytes, total: totalBytes }],
        ['loadend', { loaded: totalBytes, total: totalBytes }],
      ])
    }
  }
)
