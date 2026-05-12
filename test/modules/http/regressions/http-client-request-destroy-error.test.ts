/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { sleep } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits a single error when ClientRequest is destroyed with an error', async () => {
  const errors: Array<unknown> = []

  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked'))
  })

  const request = http.request('http://example.com/resource')
  request.on('error', (error) => {
    errors.push(error)
  })

  request.end()
  request.destroy(new Error('request aborted'))

  await sleep(250)

  expect(errors).toHaveLength(1)
})
