import { Socket } from 'net'
import http, { IncomingMessage, ClientRequest, RequestOptions } from 'http'
import { normalizeHttpRequestParams } from './normalizeHttpRequestParams'
import { inherits } from 'util'

export function ClientRequestOverride(this: ClientRequest, ...args: any[]) {
  const [url, options, callback] = normalizeHttpRequestParams(...args)

  http.OutgoingMessage.call(this)

  const socket = new Socket()
  const response = new IncomingMessage(socket)
  this.socket = this.connection = socket

  if (options.headers?.expect === '100-continue') {
    this.emit('continue')
  }

  if (callback) {
    this.once('response', callback)
  }

  this.end = () => {
    this.finished = true
    this.emit('finish')
    this.emit('response', response)

    // End the response
    response.push(null)
    response.complete = true
  }
}

inherits(ClientRequestOverride, http.ClientRequest)
