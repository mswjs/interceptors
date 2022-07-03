import { Headers } from 'headers-polyfill/lib'
import { decodeBuf } from './utils/bufferCodec'

export class BufferedRequest {
  public readonly method: string
  public readonly credentials: RequestCredentials
  public readonly headers: Headers

  constructor(
    public readonly url: URL,
    private readonly body: ArrayBuffer,
    init: RequestInit
  ) {
    this.method = init.method || 'GET'
    this.credentials = init.credentials || 'same-origin'
    this.headers = new Headers(init.headers)
  }

  public async text(): Promise<string> {
    return decodeBuf(this.body)
  }

  public async json<T = any>(): Promise<T> {
    const text = await this.text()
    return JSON.parse(text)
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    return this.body
  }
}
