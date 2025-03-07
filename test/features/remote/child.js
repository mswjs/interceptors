const { RemoteHttpInterceptor } = require('../../../RemoteHttpInterceptor')

const interceptor = new RemoteHttpInterceptor()
interceptor.apply()

function makeRequest() {
  fetch('http://localhost/api')
    .then((res) => res.json())
    .then((json) => {
      process.send(`done:${JSON.stringify(json)}`)
    })
}

process.on('message', (message) => {
  if (message === 'make:request') {
    makeRequest()
  }
})
