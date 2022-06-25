import * as http from 'http'
import { ClientRequestEmitter } from '.'
import { HttpMockAgent } from './MockHttpAgent'
import { normalizeClientRequestArgs } from './utils/normalizeClientRequestArgs'

export function createHttpGetHandler(emitter: ClientRequestEmitter) {
  return (
    target: typeof http.get,
    context: typeof http,
    args: Parameters<typeof http.get>
  ) => {
    const [url, options, callback] = normalizeClientRequestArgs(
      'http:',
      ...args
    )
    const nextOptions: http.RequestOptions = {
      ...options,
      // Inject mock agent into all constructed requests.
      agent: new HttpMockAgent({
        url,
        emitter,
      }),
    }

    return Reflect.apply(target, context, [url, nextOptions, callback])
  }
}
