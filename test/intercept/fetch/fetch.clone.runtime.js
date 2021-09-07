import { expect } from 'chai'
import { createInterceptor } from '@mswjs/interceptors'
import { interceptFetch } from '@mswjs/interceptors/lib/interceptors/fetch'

const interceptor = createInterceptor({
  modules: [interceptFetch],
  resolver() {
    // Intentionally don't mock any responses
    // so that the original responses are sent.
  },
})

interceptor.apply()

window.fetchData = async (url, expectedText) => {
  const res = await fetch(url)
  expect(await res.text()).to.equal(expectedText)
}
