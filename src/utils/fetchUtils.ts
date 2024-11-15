export interface FetchResponseInit extends ResponseInit {
  url?: string
}

export class FetchResponse extends Response {
  static readonly STATUS_CODES_WITHOUT_BODY = [101, 103, 204, 205, 304]

  static readonly STATUS_CODES_WITH_REDIRECT = [301, 302, 303, 307, 308]

  static isConfigurableStatusCode(status: number): boolean {
    return status >= 200 && status <= 599
  }

  static isRedirectResponse(status: number): boolean {
    return FetchResponse.STATUS_CODES_WITH_REDIRECT.includes(status)
  }

  static isResponseWithBody(status: number): boolean {
    return !FetchResponse.STATUS_CODES_WITHOUT_BODY.includes(status)
  }

  constructor(body?: BodyInit | null, init: FetchResponseInit = {}) {
    const status = init.status ?? 200
    const safeStatus = FetchResponse.isConfigurableStatusCode(status)
      ? status
      : 200
    const finalBody = FetchResponse.isResponseWithBody(status) ? body : null

    super(finalBody, {
      ...init,
      status: safeStatus,
    })

    if (status !== safeStatus) {
      Object.defineProperty(this, 'status', {
        value: status,
        enumerable: true,
        configurable: true,
        writable: false,
      })
    }

    if (init.url) {
      Object.defineProperty(this, 'url', {
        value: init.url,
        enumerable: true,
        configurable: true,
        writable: false,
      })
    }
  }
}
