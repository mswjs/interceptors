// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import fileUpload, { UploadedFile } from 'express-fileupload'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../../test/helpers'

const interceptor = new XMLHttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.post(
    '/upload',
    fileUpload({
      limits: { fileSize: 0.5 * 1024 * 1024 },
    }),
    (req, res) => {
      const image = req.files?.image as UploadedFile
      if (!image) {
        return res.status(400).send('Invalid uploaded file')
      }

      res.status(200).send('Successfully uploaded!')
    }
  )
})

const IMAGE_BUFFER = fs.readFileSync(
  path.resolve(__dirname, './xhr-upload.image.png')
)
const IMAGE_FILE = new File([IMAGE_BUFFER], 'image.png', { type: 'image/png' })

beforeAll(async () => {
  // interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports uploading a file to the original server', async () => {
  const loadstartListener = vi.fn()
  const progressListener = vi.fn()
  const loadListener = vi.fn()
  const loadendListener = vi.fn()
  const timeoutListener = vi.fn()
  const errorListener = vi.fn()

  const request = await createXMLHttpRequest((request) => {
    request.open('POST', httpServer.http.url('/upload'))
    request.setRequestHeader('content-type', 'multipart/form-data')

    request.upload.addEventListener('loadstart', loadstartListener)
    request.upload.addEventListener('progress', progressListener)
    request.upload.addEventListener('load', loadListener)
    request.upload.addEventListener('loadend', loadendListener)
    request.upload.addEventListener('timeout', timeoutListener)
    request.upload.addEventListener('error', errorListener)

    request.upload.addEventListener('progress', (event) => {
      console.trace('upload progress', event.loaded, event.total)
    })

    const data = new FormData()
    data.set('image', IMAGE_FILE)
    request.send(data)
  })

  expect(request.status).toBe(200)
  expect(request.responseText).toBe('Successfully uploaded!')

  expect(errorListener).not.toHaveBeenCalled()
  expect(timeoutListener).not.toHaveBeenCalled()

  expect(loadstartListener).toHaveBeenCalledOnce()
  expect(progressListener).toHaveBeenCalledOnce()
  expect(progressListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'progress',
      loaded: 0,
      total: IMAGE_FILE.size,
    })
  )
  // Must dispatch "load" to indicate successful upload.
  expect(loadListener).toHaveBeenCalledOnce()
  expect(loadendListener).toHaveBeenCalledOnce()
})
