/**
 * @jest-environment jsdom
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../../src'
import { interceptXMLHttpRequest } from '../../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../../helpers'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {
    return {
      status: 200,
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
    app.get('/', (_req, res) => {
      res.send('ok')
    })
  })

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('emits custom upload events when uploading blob', async () => {
  const record = jest.fn((_name: string) => {})

  await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.http.makeUrl('/'))

    req.upload.addEventListener('loadstart', (event: any) => {
      record('loadstart')

      // Request has body, so its length is computable.
      expect(event.lengthComputable).toEqual(true)

      // Nothing has been uploaded yet.
      expect(event.loaded).toEqual(0)

      // Request body legnth hasn't been calculated yet.
      expect(event.total).toEqual(10)
    })

    req.upload.addEventListener('progress', (event) => {
      record('progress')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    })

    req.upload.addEventListener('load', (event) => {
      record('load')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    })

    req.upload.addEventListener('loadend', (event) => {
      record('loadend')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    })

    req.upload.addEventListener('error', () => record('error'))
    req.upload.addEventListener('abort', () => record('abort'))
    req.upload.addEventListener('timeout', () => record('timeout'))

    req.send(new Blob(['hello', 'world']))
  })

  expect(record).toHaveBeenNthCalledWith(1, 'loadstart')
  expect(record).toHaveBeenNthCalledWith(2, 'progress')
  expect(record).toHaveBeenNthCalledWith(3, 'load')
  expect(record).toHaveBeenNthCalledWith(4, 'loadend')
})

test('calls custom upload callbacks when uploading blob', async () => {
  const record = jest.fn((_name: string) => {})

  await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.http.makeUrl('/'))

    req.upload.onloadstart = (event) => {
      record('loadstart')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(0)
      expect(event.total).toEqual(10)
    }

    req.upload.onprogress = (event) => {
      record('progress')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    }

    req.upload.onload = (event) => {
      record('load')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    }

    req.upload.onloadend = (event) => {
      record('loadend')
      expect(event.lengthComputable).toEqual(true)
      expect(event.loaded).toEqual(10)
      expect(event.total).toEqual(10)
    }

    req.send(new Blob(['hello', 'world']))
  })

  expect(record).toHaveBeenNthCalledWith(1, 'loadstart')
  expect(record).toHaveBeenNthCalledWith(2, 'progress')
  expect(record).toHaveBeenNthCalledWith(3, 'load')
  expect(record).toHaveBeenNthCalledWith(4, 'loadend')
})
