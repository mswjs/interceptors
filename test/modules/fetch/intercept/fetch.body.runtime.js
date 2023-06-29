import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()
interceptor.on('request', ({ request }) => {
  window.requestBody = request.clone().text()
})

interceptor.apply()

window.requestWithEmptyBody = () => {
  return fetch('/empty')
}

window.requestWithBlob = () => {
  return fetch('/blob', {
    method: 'POST',
    body: new Blob(['blob', 'string']),
  })
}

window.requestWithFormData = () => {
  const formData = new FormData()
  formData.set('username', 'john')
  formData.set('password', 'secret-123')

  return fetch('/form-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  })
}

window.requestWithArrayBuffer = () => {
  const encoder = new TextEncoder()
  const buffer = encoder.encode('buffer string')

  return fetch('/array-buffer', {
    method: 'POST',
    body: buffer,
  })
}

window.requestWithURLSearchParams = () => {
  return fetch('/search-params', {
    method: 'POST',
    body: new URLSearchParams({
      username: 'john',
      password: 'secret-123',
    }),
  })
}
