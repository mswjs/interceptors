import { copyRawHeaders } from '../interceptors/ClientRequest/utils/recordRawHeaders'
import { canParseUrl } from './canParseUrl'
import { getValueBySymbol } from './getValueBySymbol'

export interface FetchResponseInit extends ResponseInit {
  url?: string
}

interface UndiciFetchInternalState {
  aborted: boolean
  rangeRequested: boolean
  timingAllowPassed: boolean
  requestIncludesCredentials: boolean
  type: ResponseType
  status: number
  statusText: string
  timingInfo: unknown
  cacheState: unknown
  headersList: Record<symbol, Map<string, unknown>>
  urlList: Array<URL>
  body?: {
    stream: ReadableStream
    source: unknown
    length: number
  }
}

export class FetchResponse extends Response {
  static from(response: Response, init?: FetchResponseInit): FetchResponse {
    if (response instanceof FetchResponse) {
      return response
    }

    const fetchResponse = new FetchResponse(response.body, {
      url: init?.url ?? response.url,
      status: init?.status || response.status,
      statusText: init?.statusText ?? response.statusText,
      headers: init?.headers ?? response.headers,
    })

    copyRawHeaders(response.headers, fetchResponse.headers)

    return fetchResponse
  }

  /**
   * Response status codes for responses that cannot have body.
   * @see https://fetch.spec.whatwg.org/#statuses
   */
  static readonly STATUS_CODES_WITHOUT_BODY = [101, 103, 204, 205, 304]

  static readonly STATUS_CODES_WITH_REDIRECT = [301, 302, 303, 307, 308]

  static isConfigurableStatusCode(status: number): boolean {
    return status >= 200 && status <= 599
  }

  static isRedirectResponse(status: number): boolean {
    return FetchResponse.STATUS_CODES_WITH_REDIRECT.includes(status)
  }

  /**
   * Returns a boolean indicating whether the given response status
   * code represents a response that can have a body.
   */
  static isResponseWithBody(status: number): boolean {
    return !FetchResponse.STATUS_CODES_WITHOUT_BODY.includes(status)
  }

  static setStatus(status: number, response: Response): void {
    /**
     * @note Undici keeps an internal "Symbol(state)" that holds
     * the actual value of response status. Update that in Node.js.
     */
    const internalState = getValueBySymbol<UndiciFetchInternalState>(
      'state',
      response
    )

    if (internalState) {
      internalState.status = status
    } else {
      Object.defineProperty(response, 'status', {
        value: status,
        enumerable: true,
        configurable: true,
        writable: false,
      })
    }
  }

  static setUrl(url: string | undefined, response: Response): boolean {
    if (!url || url === 'about:' || !canParseUrl(url)) {
      return false
    }

    const state = getValueBySymbol<UndiciFetchInternalState>('state', response)

    if (state) {
      // In Undici, push the URL to the internal list of URLs.
      // This will respect the `response.url` getter logic correctly.
      state.urlList.push(new URL(url))
    } else {
      // In other libraries, redefine the `url` property directly.
      Object.defineProperty(response, 'url', {
        value: url,
        enumerable: true,
        configurable: true,
        writable: false,
      })
    }

    return true
  }

  /**
   * Parses the given raw HTTP headers into a Fetch API `Headers` instance.
   */
  static parseRawHeaders(rawHeaders: Array<string>): Headers {
    const headers = new Headers()
    for (let line = 0; line < rawHeaders.length; line += 2) {
      headers.append(rawHeaders[line], rawHeaders[line + 1])
    }
    return headers
  }

  #status?: number
  #url?: string

  constructor(body?: BodyInit | null, init: FetchResponseInit = {}) {
    const status = init.status ?? 200
    const safeStatus = FetchResponse.isConfigurableStatusCode(status)
      ? status
      : 200
    const finalBody = FetchResponse.isResponseWithBody(status) ? body : null

    super(finalBody, {
      status: safeStatus,
      statusText: init.statusText,
      headers: init.headers,
    })

    /**
     * Since Node.js v24, Undici stores the Response state in an inaccessible field "#state".
     * Forward the modified status/URL to the cloned response manually.
     * @see https://github.com/nodejs/undici/blob/f734c87280e626c75f59aad55b65eb6a89cef392/lib/web/fetch/response.js#L242
     */
    if (status !== safeStatus) {
      this.#status = status
      FetchResponse.setStatus(status, this)
    }

    if (init.url && FetchResponse.setUrl(init.url, this)) {
      this.#url = init.url
    }
  }

  public clone() {
    const clonedResponse = super.clone()

    if (this.#status) {
      FetchResponse.setStatus(this.#status, clonedResponse)
    }

    if (this.#url) {
      FetchResponse.setUrl(this.#url, clonedResponse)
    }

    return clonedResponse
  }
}

export class FetchRequest extends Request {
  /**
   * Check if the given method describes a request that is
   * allowed to have a body.
   */
  static isRequestWithBody(method: string): boolean {
    return (
      method !== 'HEAD' &&
      method !== 'GET' &&
      !FetchRequest.isForbiddenMethod(method)
    )
  }

  /**
   * Check if the given request method is forbidden.
   * @see https://fetch.spec.whatwg.org/#methods
   */
  static isForbiddenMethod(method: string): boolean {
    return method === 'CONNECT' || method === 'TRACE' || method === 'TRACK'
  }

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const method = init?.method || 'GET'
    const safeMethod = FetchRequest.isForbiddenMethod(method) ? 'GET' : method
    const isRequestWithBody = FetchRequest.isRequestWithBody(method)

    super(input, {
      ...(init || {}),
      method: safeMethod,
      headers: init?.headers,
      // @ts-expect-error Undocumented Fetch property.
      duplex: isRequestWithBody ? 'half' : undefined,
      body: isRequestWithBody ? init?.body : null,
    })

    if (method !== safeMethod) {
      this.#setUnconfigurableProperty('method', method)
    }

    if (method === 'CONNECT') {
      const isRequest = input instanceof Request
      const url = new URL(isRequest ? input.url : input)

      let authority: string

      /**
       * @note URL in Node.js treats "http://127.0.0.1:1334/localhost:80" urls
       * as "localhost:80", where "localhost:" is the protocol. Likely a bug.
       */
      if (url.protocol === 'localhost:') {
        authority = url.href
      } else {
        authority = url.pathname.replace(/^\/+/, '')
      }

      /**
       * @note Define "url" as a getter because Undici uses their own
       * logic to resolve the "request.url" property. Simply reassigning
       * its value doesn't do anything. This is a destructive action
       * but it's safe because "CONNECT" requests are forbidden per fetch.
       */
      Object.defineProperty(this, 'url', {
        get: () => authority,
        enumerable: true,
        configurable: true,
      })
    }
  }

  #setUnconfigurableProperty<T extends keyof Request>(
    key: T,
    value: Request[T]
  ): void {
    const internalState = getValueBySymbol('state', this)

    if (internalState) {
      Reflect.set(internalState, key, value)
    } else {
      Object.defineProperty(this, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: false,
      })
    }
  }
}
