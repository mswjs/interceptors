import { describe, it, expect } from 'vitest'
import { FetchRequest } from './fetchUtils'

describe('FetchRequest', () => {
  const URL = 'https://example.com/'

  it('passes instanceof check with the regular Request', () => {
    expect(new FetchRequest(URL)).toBeInstanceOf(Request)
  })

  it('creates a request with a non-configurable method', () => {
    expect
      .soft(new FetchRequest(URL, { method: 'CONNECT' }))
      .toHaveProperty('method', 'CONNECT')

    expect
      .soft(new FetchRequest(URL, { method: 'TRACE' }))
      .toHaveProperty('method', 'TRACE')
    expect
      .soft(new FetchRequest(new FetchRequest(URL, { method: 'TRACE' })))
      .toHaveProperty('method', 'TRACE')

    expect
      .soft(new FetchRequest(URL, { method: 'TRACK' }))
      .toHaveProperty('method', 'TRACK')
    expect
      .soft(new FetchRequest(new FetchRequest(URL, { method: 'TRACK' })))
      .toHaveProperty('method', 'TRACK')
  })

  it('creates a request with a non-configurable mode', () => {
    expect
      .soft(new FetchRequest(URL, { mode: 'navigate' }))
      .toHaveProperty('mode', 'navigate')
    expect
      .soft(new FetchRequest(new FetchRequest(URL, { mode: 'navigate' })))
      .toHaveProperty('mode', 'navigate')

    expect
      .soft(new FetchRequest(URL, { mode: 'websocket' }))
      .toHaveProperty('mode', 'websocket')
    expect
      .soft(new FetchRequest(new FetchRequest(URL, { mode: 'websocket' })))
      .toHaveProperty('mode', 'websocket')

    expect
      .soft(new FetchRequest(URL, { mode: 'webtransport' }))
      .toHaveProperty('mode', 'webtransport')
    expect
      .soft(new FetchRequest(new FetchRequest(URL, { mode: 'webtransport' })))
      .toHaveProperty('mode', 'webtransport')
  })

  it('ignores body for the requests without a body', () => {
    expect
      .soft(new FetchRequest(URL, { body: null }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { body: undefined }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { body: 'hello' }))
      .toHaveProperty('body', null)

    expect
      .soft(new FetchRequest(URL, { method: 'GET', body: 'hello' }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { method: 'HEAD', body: 'hello' }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { method: 'CONNECT', body: 'hello' }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { method: 'TRACE', body: 'hello' }))
      .toHaveProperty('body', null)
    expect
      .soft(new FetchRequest(URL, { method: 'TRACK', body: 'hello' }))
      .toHaveProperty('body', null)

    expect
      .soft(new FetchRequest(URL, { method: 'POST', body: 'hello' }))
      .toHaveProperty('body', expect.any(ReadableStream))
  })
})
