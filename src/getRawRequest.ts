const kRawRequest = Symbol('kRawRequest')
const kRawResponse = Symbol('kRawResponse')

/**
 * Returns a raw request instance associated with this request.
 *
 * @example
 * interceptor.on('request', ({ request }) => {
 *   const rawRequest = getRawRequest(request)
 *
 *   if (rawRequest instanceof http.ClientRequest) {
 *     console.log(rawRequest.rawHeaders)
 *   }
 * })
 */
export function getRawRequest(request: Request): unknown | undefined {
  return Reflect.get(request, kRawRequest)
}

export function setRawRequest(request: Request, rawRequest: unknown): void {
  Reflect.set(request, kRawRequest, rawRequest)
}

/**
 * Returns a raw response instance associated with this request.
 *
 * @example
 * interceptor.on('response', ({ response }) => {
 *   const rawResponse = getRawResponse(response)
 *
 *   if (rawResponse instanceof http.IncomingMessage) {
 *     console.log(rawResponse.rawHeaders)
 *   }
 * })
 */
export function getRawResponse(response: Response): unknown | undefined {
  return Reflect.get(response, kRawResponse)
}

export function setRawResponse(response: Response, rawResponse: unknown): void {
  Reflect.set(response, kRawResponse, rawResponse)
}