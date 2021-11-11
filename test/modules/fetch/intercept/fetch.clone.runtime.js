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

window.fetchData = async (url) => {
  const res = await fetch(url)
  // expect(await res.text()).to.equal(expectedText)
  document.dispatchEvent(
    new CustomEvent('response-text', {
      detail: await res.text(),
    })
  )
}
