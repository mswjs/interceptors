import { AsyncLocalStorage } from 'node:async_hooks'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

const interceptor = new FetchInterceptor()
const asyncContext = new AsyncLocalStorage<string>()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

function fetchInContext(context: string): Promise<string> {
  return asyncContext.run(context, () => {
    return fetch(`https://example.com/${context}`).then((response) => {
      return response.text()
    })
  })
}

it('preserves the async context of concurrent fetch calls to the same origin', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(asyncContext.getStore()))
  })

  await expect(
    Promise.all([fetchInContext('a'), fetchInContext('b'), fetchInContext('c')])
  ).resolves.toEqual(['a', 'b', 'c'])
})

it('attributes concurrent fetch calls to the same origin to their own initiators', async () => {
  interceptor.on('request', ({ initiator, controller }) => {
    controller.respondWith(
      new Response(initiator instanceof Request ? initiator.url : 'unknown')
    )
  })

  await expect(
    Promise.all([fetchInContext('a'), fetchInContext('b'), fetchInContext('c')])
  ).resolves.toEqual([
    'https://example.com/a',
    'https://example.com/b',
    'https://example.com/c',
  ])
})
