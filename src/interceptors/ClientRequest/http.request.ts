import { debug } from 'debug'
import { ClientRequest } from 'http'
import { Observer, Resolver } from '../../createInterceptor'
import { NodeClientRequest, Protocol } from './NodeClientRequest'
import {
  normalizeClientRequestArgs,
  ClientRequestArgs,
} from './utils/normalizeClientRequestArgs'

const log = debug('http.request')

export function request(
  protocol: Protocol,
  resolver: Resolver,
  observer: Observer
) {
  return (...args: ClientRequestArgs): ClientRequest => {
    log('request call (protocol "%s"):', protocol, args)

    const clientRequestArgs = normalizeClientRequestArgs(
      `${protocol}:`,
      ...args
    )
    return new NodeClientRequest(clientRequestArgs, {
      observer,
      resolver,
    })
  }
}
