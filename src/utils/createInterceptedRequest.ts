import { ClientRequest, RequestOptions } from 'http'
import { InterceptedRequest } from '../glossary'

export const createInterceptedRequest = (
  url: URL,
  options: RequestOptions,
  req: ClientRequest
): InterceptedRequest => {
  return {
    /**
     * @todo Align with all possible instances of `input` of `ClientRequest`.
     */
    url: url.href,
    method: options.method || 'GET',
  }
}
