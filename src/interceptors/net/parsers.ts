import {
  HeadersCallback,
  HTTPParser,
  RequestHeadersCompleteCallback,
} from '_http_common'

export class HttpRequestParser {
  #parser: HTTPParser<typeof HTTPParser.REQUEST>

  constructor(options: {
    onMessageBegin?: () => void
    onHeaders?: HeadersCallback
    onHeadersComplete?: RequestHeadersCompleteCallback
    onBody?: (chunk: Buffer) => void
    onMessageComplete?: () => void
    onExecute?: () => void
    onTimeout?: () => void
  }) {
    this.#parser = new HTTPParser()
    this.#parser.initialize(HTTPParser.REQUEST, {})
    this.#parser[HTTPParser.kOnMessageBegin] = options.onMessageBegin
    this.#parser[HTTPParser.kOnHeaders] = options.onHeaders
    this.#parser[HTTPParser.kOnHeadersComplete] = options.onHeadersComplete
    this.#parser[HTTPParser.kOnBody] = options.onBody
    this.#parser[HTTPParser.kOnMessageComplete] = options.onMessageComplete
    this.#parser[HTTPParser.kOnExecute] = options.onExecute
    this.#parser[HTTPParser.kOnTimeout] = options.onTimeout
  }

  public execute(buffer: Buffer): void {
    this.#parser.execute(buffer)
  }

  public free(): void {
    this.#parser.free()
  }
}
