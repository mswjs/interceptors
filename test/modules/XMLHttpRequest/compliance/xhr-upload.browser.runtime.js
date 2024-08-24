import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.apply()
window.interceptor = interceptor

window.waitForXMLHttpRequest = (xhr) => {
  return new Promise((resolve, reject) => {
    xhr.addEventListener('loadend', resolve)
    xhr.addEventListener('error', () => {
      reject(new Error('XMLHttpRequest errored'))
    })
  })
}

window.spyOnXMLHttpRequest = (target) => {
  const listeners = []
  const callbacks = []

  const pushListener = ({ type, loaded, total }) => {
    listeners.push({ type, loaded, total })
  }
  const pushCallback = ({ type, loaded, total }) => {
    callbacks.push({ type, loaded, total })
  }

  target.addEventListener('loadstart', pushListener)
  target.addEventListener('progress', pushListener)
  target.addEventListener('load', pushListener)
  target.addEventListener('loadend', pushListener)
  target.addEventListener('timeout', pushListener)
  target.addEventListener('error', pushListener)

  target.onloadstart = pushCallback
  target.onprogress = pushCallback
  target.onload = pushCallback
  target.onloadend = pushCallback
  target.ontimeout = pushCallback
  target.onerror = pushCallback

  return { listeners, callbacks }
}
