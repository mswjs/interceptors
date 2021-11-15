import { createInterceptor } from '@mswjs/interceptors'
import { interceptXMLHttpRequest } from '@mswjs/interceptors/lib/interceptors/XMLHttpRequest'

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver() {
    return {
      status: 200,
    }
  },
})

interceptor.apply()

window.events = []
window.callbacks = []

function captureEvent(name) {
  return (event) => {
    window.events.push([name, { loaded: event.loaded, total: event.total }])
  }
}

function captureCallback(name) {
  return (event) => {
    window.callbacks.push([name, { loaded: event.loaded, total: event.total }])
  }
}

// Upload data.
const req = new XMLHttpRequest()
req.open('POST', window.endpointUrl)

// Events.
req.upload.addEventListener('loadstart', captureEvent('loadstart'))
req.upload.addEventListener('progress', captureEvent('progress'))
req.upload.addEventListener('load', captureEvent('load'))
req.upload.addEventListener('loadend', captureEvent('loadend'))
req.upload.addEventListener('abort', captureEvent('abort'))
req.upload.addEventListener('error', captureEvent('error'))

// Callbacks.
req.upload.onloadstart = captureCallback('loadstart')
req.upload.onprogress = captureCallback('progress')
req.upload.onload = captureCallback('load')
req.upload.onloadend = captureCallback('loadend')
req.upload.onabort = captureCallback('abort')
req.upload.onerror = captureCallback('error')

req.addEventListener('loadend', () => {
  window.postMessage('loadend')
})

const data = new FormData()
data.append('file.txt', new Blob(['hello', 'world']))

document.body.addEventListener('click', () => {
  window.events = []
  window.callbacks = []

  req.send(data)
})
