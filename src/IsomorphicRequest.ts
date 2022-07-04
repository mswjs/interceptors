import { Headers } from 'headers-polyfill/lib'
import { decodeBuffer } from './utils/bufferUtils'
import { uuidv4 } from './utils/uuid'

export interface RequestInit {
  method?: string
  headers?: Record<string, string | string[]> | Headers
  credentials?: RequestCredentials
  body?: ArrayBuffer
}

export class IsomorphicRequest {
  public id: string
  public readonly url: URL
  public readonly method: string
  public readonly headers: Headers
  public readonly credentials: RequestCredentials

  private readonly body: ArrayBuffer
  private _bodyUsed: boolean

  constructor(url: URL)
  constructor(url: URL, init: RequestInit)
  constructor(request: IsomorphicRequest)
  constructor(input: IsomorphicRequest | URL, init: RequestInit = {}) {
    const defaultBody = new ArrayBuffer(0)

    if (input instanceof IsomorphicRequest) {
      this.id = input.id
      this.url = input.url
      this.method = input.method
      this.headers = input.headers
      this.credentials = input.credentials
      this.body = input.body || defaultBody
      this._bodyUsed = input.bodyUsed
      return
    }

    this.id = uuidv4()
    this.url = input
    this.method = init.method || 'GET'
    this.headers = new Headers(init.headers)
    this.credentials = init.credentials || 'same-origin'
    this.body = init.body || defaultBody
    this._bodyUsed = false
  }

  public get bodyUsed(): boolean {
    return this._bodyUsed
  }

  public async text(): Promise<string> {
    this._bodyUsed = true
    const buffer = await this.arrayBuffer()
    return decodeBuffer(buffer)
  }

  public async json<T = any>(): Promise<T> {
    this._bodyUsed = true
    const text = await this.text()
    return JSON.parse(text)
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    this._bodyUsed = true
    return this.body
  }
}
