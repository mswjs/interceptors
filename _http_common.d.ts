declare var HTTPParser: {
  new (): HTTPParser<number>
  REQUEST: 0
  RESPONSE: 1

  /**
   * @see https://github.com/nodejs/node/blob/229cc3be28eab3153c16bc55bc67d1e81c4a7067/src/node_http_parser.cc#L76
   */
  readonly kOnMessageBegin: unique symbol
  readonly kOnHeaders: unique symbol
  readonly kOnHeadersComplete: unique symbol
  readonly kOnBody: unique symbol
  readonly kOnMessageComplete: unique symbol
  readonly kOnExecute: unique symbol
  readonly kOnTimeout: unique symbol
}

export interface HTTPParser<ParserType extends number> {
  new (): HTTPParser<ParserType>

  [HTTPParser.kOnMessageBegin]?: (() => void) | null
  [HTTPParser.kOnHeaders]?: HeadersCallback
  [HTTPParser.kOnHeadersComplete]?: ParserType extends 0
    ? RequestHeadersCompleteCallback | null
    : ResponseHeadersCompleteCallback | null
  [HTTPParser.kOnBody]?: ((chunk: Buffer) => void) | null
  [HTTPParser.kOnMessageComplete]?: (() => void) | null
  [HTTPParser.kOnExecute]?: (() => void) | null
  [HTTPParser.kOnTimeout]?: (() => void) | null

  _consumed?: boolean
  _headers?: Array<unknown>
  _url: string
  maxHeaderPairs: number
  socket?: typeof import('node:net').Socket | null
  incoming?: typeof import('node:http').IncomingMessage | null
  outgoing?: typeof import('node:http').OutgoingMessage | null
  onIncoming?: (() => void) | null
  joinDuplicateHeaders?: unknown

  initialize(type: ParserType, asyncResource: object): void
  execute(buffer: Buffer): void
  finish(): void
  unconsume(): void
  remove(): void
  close(): void
  free(): boolean
}

export type HeadersCallback = (rawHeaders: Array<string>, url: string) => void

export type RequestHeadersCompleteCallback = (
  versionMajor: number,
  versionMinor: number,
  rawHeaders: Array<string>,
  idk: number,
  path: string,
  idk2: unknown,
  idk3: unknown,
  idk4: unknown,
  shouldKeepAlive: boolean
) => void

export type ResponseHeadersCompleteCallback = (
  versionMajor: number,
  versionMinor: number,
  headers: Array<string>,
  method: string | undefined,
  url: string | undefined,
  status: number,
  statusText: string,
  upgrade: boolean,
  shouldKeepAlive: boolean
) => void
