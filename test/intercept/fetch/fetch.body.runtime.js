import { expect } from 'chai'
import { createInterceptor } from 'node-request-interceptor'
import { interceptFetch } from 'node-request-interceptor/lib/interceptors/fetch'

const interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver(request) {
    switch (request.url.pathname) {
      case '/empty': {
        expect(request.body).to.equal('')
        break
      }

      case '/blob': {
        expect(request.body).to.equal('blobstring')
        break
      }

      case '/form-data': {
        expect(request.body).to.match(
          /------WebKitFormBoundary.+\r\nContent-Disposition: form-data; name="username"\r\n\r\njohn\r\n------WebKitFormBoundary.+\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecret-123\r\n------WebKitFormBoundary.+--\r\n$/gm
        )
        break
      }

      case '/array-buffer': {
        expect(request.body).to.equal('buffer string')
        break
      }

      case '/search-params': {
        expect(request.body).to.equal('username=john&password=secret-123')
        break
      }
    }
  },
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
