import { ClientRequest } from 'http'
import { Logger } from '@open-draft/logger'
import {
  NodeClientOptions,
  NodeClientRequest,
  Protocol,
} from './NodeClientRequest'
import {
  normalizeClientRequestArgs,
  ClientRequestArgs,
} from './utils/normalizeClientRequestArgs'

const logger = new Logger('http request')

export function request(protocol: Protocol, options: NodeClientOptions) {
  return (...args: ClientRequestArgs): ClientRequest => {
    logger.info('request call (protocol "%s"):', protocol, args)

    const clientRequestArgs = normalizeClientRequestArgs(
      `${protocol}:`,
      ...args
    )

    const [, requestOptions] = clientRequestArgs;

    if (!requestOptions.signal) {
      const abortController = new AbortController();
      requestOptions.signal = abortController.signal;
    }

    options.registerSignal(requestOptions.signal);
    return new NodeClientRequest(clientRequestArgs, options)
  }
}
