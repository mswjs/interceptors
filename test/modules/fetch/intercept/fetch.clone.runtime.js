import { FetchInterceptor } from '@mswjs/interceptors/fetch'

// Intentionally don't mock any responses
// so that the original responses are sent.
const interceptor = new FetchInterceptor()

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
