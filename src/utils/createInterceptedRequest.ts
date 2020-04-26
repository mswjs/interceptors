import { ClientRequest } from 'http'
import { InterceptedRequest, ClientRequestInput } from '../glossary'

export const createInterceptedRequest = (
  input: ClientRequestInput,
  req: ClientRequest
): InterceptedRequest => {
  return {
    url: (input as URL).href,
    method: req.method,
  }
}
