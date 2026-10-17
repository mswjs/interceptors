import { createNetworkError } from './create-network-error'

const REQUEST_BODY_HEADERS = [
  'content-encoding',
  'content-language',
  'content-location',
  'content-type',
  'content-length',
]

const kRedirectCount = Symbol('kRedirectCount')

/**
 * @see https://github.com/nodejs/undici/blob/a6dac3149c505b58d2e6d068b97f4dc993da55f0/lib/web/fetch/index.js#L1210
 */
interface FollowFetchRedirectOptions {
  /**
   * Whether the request body was provided as a stream.
   * A stream cannot be read again, so only a `Request` created from
   * a stream fails to follow the redirects that re-send the body.
   */
  hasStreamingBody: boolean
}

export async function followFetchRedirect(
  request: Request,
  response: Response,
  options: FollowFetchRedirectOptions
): Promise<Response> {
  const location = response.headers.get('location')

  // A redirect response without a location is returned as-is.
  if (location == null) {
    return response
  }

  /**
   * @see https://fetch.spec.whatwg.org/#http-redirect-fetch (step 9)
   */
  if (
    response.status !== 303 &&
    request.body != null &&
    options.hasStreamingBody
  ) {
    return Promise.reject(createNetworkError())
  }

  const coercesToGet =
    ([301, 302].includes(response.status) && request.method === 'POST') ||
    (response.status === 303 && !['HEAD', 'GET'].includes(request.method))

  /**
   * @note The request body cannot be sent again once it was read.
   * Only the redirects that drop the body can be followed.
   */
  if (!coercesToGet && request.body != null) {
    return Promise.reject(createNetworkError())
  }

  const requestUrl = new URL(request.url)

  let locationUrl: URL
  try {
    // If the location is a relative URL, use the request URL as the base URL.
    locationUrl = new URL(location, request.url)
  } catch (error) {
    return Promise.reject(createNetworkError(error))
  }

  if (!(
    locationUrl.protocol === 'http:' || locationUrl.protocol === 'https:'
  )) {
    return Promise.reject(
      createNetworkError('URL scheme must be a HTTP(S) scheme')
    )
  }

  if (Reflect.get(request, kRedirectCount) > 20) {
    return Promise.reject(createNetworkError('redirect count exceeded'))
  }

  Object.defineProperty(request, kRedirectCount, {
    value: (Reflect.get(request, kRedirectCount) || 0) + 1,
  })

  if (
    request.mode === 'cors' &&
    (locationUrl.username || locationUrl.password) &&
    !sameOrigin(requestUrl, locationUrl)
  ) {
    return Promise.reject(
      createNetworkError('cross origin not allowed for request mode "cors"')
    )
  }

  const requestInit: RequestInit = {}

  if (coercesToGet) {
    requestInit.method = 'GET'
    requestInit.body = null

    REQUEST_BODY_HEADERS.forEach((headerName) => {
      request.headers.delete(headerName)
    })
  }

  if (!sameOrigin(requestUrl, locationUrl)) {
    request.headers.delete('authorization')
    request.headers.delete('proxy-authorization')
    request.headers.delete('cookie')
    request.headers.delete('host')
  }

  /**
   * @note Undici "safely" extracts the request body.
   * I suspect we cannot dispatch this request again
   * since its body has been read and the stream is locked.
   */

  requestInit.headers = request.headers
  const finalResponse = await fetch(new Request(locationUrl, requestInit))
  Object.defineProperty(finalResponse, 'redirected', {
    value: true,
    configurable: true,
  })

  return finalResponse
}

/**
 * @see https://github.com/nodejs/undici/blob/a6dac3149c505b58d2e6d068b97f4dc993da55f0/lib/web/fetch/util.js#L761
 */
function sameOrigin(left: URL, right: URL): boolean {
  if (left.origin === right.origin && left.origin === 'null') {
    return true
  }

  if (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port
  ) {
    return true
  }

  return false
}
