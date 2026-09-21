// @vitest-environment node
import { Agent, fetch } from 'undici'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

afterEach(() => {
  interceptor.removeAllListeners()
  interceptor.dispose()
})

type PoolStats = Extract<Agent['stats'][string], { free: number }>

function getConnectionStats(
  agent: Agent,
  origin: string
): PoolStats | undefined {
  const stats = agent.stats[origin]
  return stats && 'free' in stats ? stats : undefined
}

it('destroys the idle mocked keep-alive connections when disposed', async () => {
  interceptor.apply()
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mocked', {
        headers: { 'content-length': '6' },
      })
    )
  })

  const agent = new Agent()
  onTestFinished(() => agent.close())

  const response = await fetch('http://localhost/resource', {
    dispatcher: agent,
  })
  await expect(response.text()).resolves.toBe('mocked')
  await expect
    .poll(() => getConnectionStats(agent, 'http://localhost')?.free, {
      message: 'the agent keeps the mocked connection alive',
    })
    .toBe(1)

  interceptor.dispose()

  await expect
    .poll(() => getConnectionStats(agent, 'http://localhost')?.connected, {
      message: 'the mocked connection is closed',
    })
    .toBe(0)
})

it('finishes a mocked request in flight when disposed', async () => {
  interceptor.apply()
  const respond = Promise.withResolvers<void>()
  interceptor.on('request', async ({ controller }) => {
    await respond.promise
    controller.respondWith(
      new Response('mocked', {
        headers: { 'content-length': '6' },
      })
    )
  })

  const agent = new Agent()
  onTestFinished(() => agent.close())

  const responsePromise = fetch('http://localhost/resource', {
    dispatcher: agent,
  })
  await expect
    .poll(() => getConnectionStats(agent, 'http://localhost')?.running, {
      message: 'the request is in flight',
    })
    .toBe(1)

  interceptor.dispose()
  respond.resolve()

  const response = await responsePromise
  await expect(response.text()).resolves.toBe('mocked')

  await expect
    .poll(
      () => getConnectionStats(agent, 'http://localhost')?.connected ?? 0,
      {
        message: 'the mocked connection is closed once the request settles',
      }
    )
    .toBe(0)
})
