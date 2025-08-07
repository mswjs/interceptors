import {
  HTTPParser,
  type HeadersCallback,
  type RequestHeadersCompleteCallback,
  type ResponseHeadersCompleteCallback,
} from '_http_common'

type HttpParserKind = typeof HTTPParser.REQUEST | typeof HTTPParser.RESPONSE

export class HttpParser<ParserKind extends HttpParserKind> {
  static REQUEST = HTTPParser.REQUEST
  static RESPONSE = HTTPParser.RESPONSE

  #parser: HTTPParser<HttpParserKind>

  constructor(
    kind: ParserKind,
    hooks: {
      onMessageBegin?: () => void
      onHeaders?: HeadersCallback
      onHeadersComplete?: ParserKind extends typeof HTTPParser.REQUEST
        ? RequestHeadersCompleteCallback
        : ResponseHeadersCompleteCallback
      onBody?: (chunk: Buffer) => void
      onMessageComplete?: () => void
      onExecute?: () => void
      onTimeout?: () => void
    }
  ) {
    this.#parser = new HTTPParser()
    this.#parser.initialize(kind, {})
    this.#parser[HTTPParser.kOnMessageBegin] = hooks.onMessageBegin
    this.#parser[HTTPParser.kOnHeaders] = hooks.onHeaders
    this.#parser[HTTPParser.kOnHeadersComplete] = hooks.onHeadersComplete
    this.#parser[HTTPParser.kOnBody] = hooks.onBody
    this.#parser[HTTPParser.kOnMessageComplete] = hooks.onMessageComplete
    this.#parser[HTTPParser.kOnExecute] = hooks.onExecute
    this.#parser[HTTPParser.kOnTimeout] = hooks.onTimeout
  }

  public execute(buffer: Buffer): void {
    this.#parser.execute(buffer)
  }

  public free(): void {
    this.#parser.free()
  }
}
