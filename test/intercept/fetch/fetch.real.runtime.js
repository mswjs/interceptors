import { expect } from 'chai'
import { createInterceptor } from '@mswjs/interceptors'
import { interceptFetch } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver() {},
})

interceptor.apply()

window.fetchData = async(url, options, expected) => {
  const response = await fetch(url, options)
  expect(response.status).to.equal(expected.status)
  expect(response.statusText).to.equal(expected.statusText)
  expect(await response.text()).to.equal(expected.text)
}