import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()
interceptor.apply()
window.interceptor = interceptor

window.waitForXMLHttpRequest = (xhr) => {
  return new Promise((resolve, reject) => {
    xhr.onload = resolve
    xhr.onerror = () => reject(new Error('XMLHttpRequest errored'))
  })
}

window.spyOnXMLHttpRequest = (xhr) => {
  const listeners = []
  const callbacks = []

  const pushListener = ({ type, loaded, total }) => {
    listeners.push({ type, loaded, total })
  }
  const pushCallback = ({ type, loaded, total }) => {
    callbacks.push({ type, loaded, total })
  }

  xhr.upload.addEventListener('loadstart', pushListener)
  xhr.upload.addEventListener('progress', pushListener)
  xhr.upload.addEventListener('load', pushListener)
  xhr.upload.addEventListener('loadend', pushListener)
  xhr.upload.addEventListener('timeout', pushListener)
  xhr.upload.addEventListener('error', pushListener)

  xhr.upload.onloadstart = pushCallback
  xhr.upload.onprogress = pushCallback
  xhr.upload.onload = pushCallback
  xhr.upload.onloadend = pushCallback
  xhr.upload.ontimeout = pushCallback
  xhr.upload.onerror = pushCallback

  return { listeners, callbacks }
}
