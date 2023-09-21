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
  return function interceptorsHttpRequest(
    ...args: ClientRequestArgs
  ): ClientRequest {
    logger.info('request call (protocol "%s"):', protocol, args)

    const clientRequestArgs = normalizeClientRequestArgs(
      `${protocol}:`,
      ...args
    )
    return new NodeClientRequest(clientRequestArgs, options)
  }
}
