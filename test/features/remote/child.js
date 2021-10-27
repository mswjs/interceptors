const fetch = require('node-fetch')
const { createRemoteInterceptor } = require('../../../lib')
const {
  interceptClientRequest,
} = require('../../../lib/interceptors/ClientRequest')

const interceptor = createRemoteInterceptor({
  modules: [interceptClientRequest],
})

interceptor.apply()

function makeRequest() {
  fetch('https://httpbin.org/get')
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

process.on('disconnect', () => {
  interceptor.restore()
})
