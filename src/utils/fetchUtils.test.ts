import { describe, it, expect } from 'vitest'
import { FetchRequest } from './fetchUtils'

describe('FetchRequest', () => {
  const URL = 'https://example.com/'

  it('creates a request with a non-configurable method', () => {
    expect
      .soft(new FetchRequest(URL, { method: 'CONNECT' }))
      .toHaveProperty('method', 'CONNECT')
    expect
      .soft(new FetchRequest(URL, { method: 'TRACE' }))
      .toHaveProperty('method', 'TRACE')
    expect
      .soft(new FetchRequest(URL, { method: 'TRACK' }))
      .toHaveProperty('method', 'TRACK')
  })

  it('creates a request with a non-configurable mode', () => {
    expect
      .soft(new FetchRequest(URL, { mode: 'navigate' }))
      .toHaveProperty('mode', 'navigate')
    expect
      .soft(new FetchRequest(URL, { mode: 'websocket' }))
      .toHaveProperty('mode', 'websocket')
    expect
      .soft(new FetchRequest(URL, { mode: 'webtransport' }))
      .toHaveProperty('mode', 'webtransport')
  })
})
