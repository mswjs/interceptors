import { Headers } from 'headers-polyfill/lib'
import { BufferedRequest } from './BufferedRequest'
import { encodeBuf } from './utils/bufferCodec'

describe('Request', () => {
  const url = new URL('http://dummy')
  const buf = encodeBuf(JSON.stringify({ hello: 'world' }))

  it('returns JSON, text and array buffer', () => {
    const request = new BufferedRequest(url, buf, {})
    const json = request.json()
    const text = request.text()
    const arrayBuffer = request.arrayBuffer()
    expect(json).toEqual({ hello: 'world' })
    expect(text).toEqual(JSON.stringify({ hello: 'world' }))
    expect(arrayBuffer).toEqual(encodeBuf(`{"hello":"world"}`))
  })

  it('return default method', () => {
    const request = new BufferedRequest(url, buf, {})
    expect(request.method).toEqual('GET')
  })

  it('return given method', () => {
    const request = new BufferedRequest(url, buf, { method: 'POST' })
    expect(request.method).toEqual('POST')
  })

  it('return given credentials', () => {
    const request = new BufferedRequest(url, buf, { credentials: 'include' })
    expect(request.credentials).toEqual('include')
  })

  it('return default credentials', () => {
    const request = new BufferedRequest(url, buf, {})
    expect(request.credentials).toEqual('same-origin')
  })

  it('return empty headers if not provided', () => {
    const request = new BufferedRequest(url, buf, {})
    expect(request.headers).toEqual(new Headers())
  })

  it('return empty headers if not provided', () => {
    const request = new BufferedRequest(url, buf, {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(request.headers).toEqual(
      new Headers({ 'Content-Type': 'application/json' })
    )
  })
})
