import { Debugger, debug } from 'debug'
import type { RequestOptions } from 'http'
import { ClientRequest, IncomingMessage } from 'http'
import { until } from '@open-draft/until'
import { Headers, objectToHeaders } from 'headers-utils/lib'
import type {
  IsomorphicRequest,
  MockedResponse,
  Observer,
  Resolver,
} from '../../createInterceptor'
import { uuidv4 } from '../../utils/uuid'
import { concatChunkToBuffer } from './utils/concatChunkToBuffer'
import {
  ClientRequestEndChunk,
  normalizeClientRequestEndArgs,
} from './utils/normalizeClientRequestEndArgs'
import { NormalizedClientRequestArgs } from './utils/normalizeClientRequestArgs'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { bodyBufferToString } from './utils/bodyBufferToString'
import {
  ClientRequestWriteArgs,
  normalizeClientRequestWriteArgs,
} from './utils/normalizeClientRequestWriteArgs'
import { cloneIncomingMessage } from './utils/cloneIncomingMessage'

export type Protocol = 'http' | 'https'

export interface NodeClientOptions {
  observer: Observer
  resolver: Resolver
}

export class NodeClientRequest extends ClientRequest {
  private url: URL
  private options: RequestOptions
  private requestBodyBuffer: Buffer[] = []
  private response: IncomingMessage
  private resolver: Resolver
  private observer: Observer
  private log: Debugger

  constructor(
    [url, requestOptions, callback]: NormalizedClientRequestArgs,
    options: NodeClientOptions
  ) {
    super(requestOptions, callback)

    this.log = debug(`http ${requestOptions.method} ${url.href}`)
    this.log('constructing ClientRequest...', {
      url,
      requestOptions,
      callback,
    })

    this.url = url
    this.options = requestOptions
    this.resolver = options.resolver
    this.observer = options.observer

    // Construct a mocked response message.
    this.response = new IncomingMessage(this.socket!)
  }

  write(...args: ClientRequestWriteArgs): boolean {
    this.log('writing chunk:', args)

    const [chunk, encoding, callback] = normalizeClientRequestWriteArgs(args)

    const afterWrite = (error?: Error | null): void => {
      if (error) {
        this.emit('error while writing chunk!', error)
      }
      callback?.(error)
    }

    const result = encoding
      ? super.write(chunk, encoding, afterWrite)
      : super.write(chunk, afterWrite)

    if (result) {
      this.log('chunk successfully written!')
      this.requestBodyBuffer = concatChunkToBuffer(
        chunk,
        this.requestBodyBuffer
      )
    }

    return result
  }

  async end(...args: any) {
    this.log('end', args)

    const [chunk, encoding, callback] = normalizeClientRequestEndArgs(...args)
    this.log('normalized arguments:', { chunk, encoding, callback })

    const requestBody = this.getRequestBody(chunk)
    const isomorphicRequest = this.toIsomorphicRequest(requestBody)
    this.observer.emit('request', isomorphicRequest)

    this.log('executing response resolver...')
    const [resolverError, mockedResponse] = await until(async () =>
      this.resolver(isomorphicRequest, this.response)
    )

    // Halt the request whenever the resolver throws an exception.
    if (resolverError) {
      this.log('encountered resolver exception, aborting request...')
      this.emit('error', resolverError)
      this.terminate()

      return this
    }

    if (mockedResponse) {
      this.log('received mocked response:', mockedResponse)

      const isomorphicResponse = toIsoResponse(mockedResponse)
      this.log(
        isomorphicResponse.status,
        isomorphicResponse.statusText,
        isomorphicResponse.body,
        '(MOCKED)'
      )

      this.respondWith(mockedResponse)
      callback?.()

      this.observer.emit('response', isomorphicRequest, isomorphicResponse)

      return this
    }

    this.log('no mocked response found!')

    this.once('error', (error) => {
      this.log('original request error:', error)
    })

    this.once('abort', () => {
      this.log('original request aborted!')
    })

    this.once('response-internal', async (response: IncomingMessage) => {
      const responseBody = await getIncomingMessageBody(response)
      this.log(response.statusCode, response.statusMessage, responseBody)
      this.log('original response headers:', response.headers)

      this.observer.emit('response', isomorphicRequest, {
        status: response.statusCode || 200,
        statusText: response.statusMessage || 'OK',
        headers: objectToHeaders(response.headers),
        body: responseBody,
      })
    })

    this.log('performing original request...')

    return super.end(chunk, encoding || 'utf8', () => {
      this.log('original request end!')
      callback?.()
    })
  }

  emit(event: string, ...data: any[]) {
    this.log('event:%s', event)

    if (event === 'response') {
      this.log('found "response" event, cloning the response...')

      try {
        /**
         * Clone the response object when emitting the "response" event.
         * This prevents the response body stream from locking
         * and allows reading it twice:
         * 1. Internal "response" event from the observer.
         * 2. Any external response body listeners.
         * @see https://github.com/mswjs/interceptors/issues/161
         */
        const response = data[0] as IncomingMessage
        const firstClone = cloneIncomingMessage(response)
        const secondClone = cloneIncomingMessage(response)

        this.emit('response-internal', secondClone)

        this.log('response successfuly cloned, emitting "response" event...')
        return super.emit(event, firstClone, ...data.slice(1))
      } catch (error) {
        this.log('error when cloning response:', error)
        return super.emit(event, ...data)
      }
    }

    return super.emit(event, ...data)
  }

  private respondWith(mockedResponse: MockedResponse): void {
    const { status, statusText, headers, body } = mockedResponse
    this.response.statusCode = status
    this.response.statusMessage = statusText

    if (headers) {
      this.response.headers = {}

      for (const [headerName, headerValue] of Object.entries(headers)) {
        this.response.rawHeaders.push(
          headerName,
          ...(Array.isArray(headerValue) ? headerValue : [headerValue])
        )

        const insensitiveHeaderName = headerName.toLowerCase()
        const prevHeaders = this.response.headers[insensitiveHeaderName]
        this.response.headers[insensitiveHeaderName] = prevHeaders
          ? Array.prototype.concat([], prevHeaders, headerValue)
          : headerValue
      }
    }

    if (body) {
      this.response.push(Buffer.from(body))
    }

    // Push "null" to indicate that the response body is complete
    // and shouldn't be written to anymore.
    this.response.push(null)
    this.response.complete = true

    /**
     * Set the internal "res" property to the mocked "OutgoingMessage"
     * to make the "ClientRequest" instance think there's data received
     * from the socket.
     * @see https://github.com/nodejs/node/blob/9c405f2591f5833d0247ed0fafdcd68c5b14ce7a/lib/_http_client.js#L501
     */
    // @ts-ignore
    this.res = this.response

    this.finished = true
    Object.defineProperty(this, 'writableEnded', {
      value: true,
    })

    this.emit('finish')
    this.emit('response', this.response)

    this.terminate()
  }

  /**
   * Terminates a pending request.
   */
  private terminate(): void {
    // @ts-ignore
    this.agent.destroy()
  }

  private getRequestBody(chunk: ClientRequestEndChunk | null): string {
    const writtenRequestBody = bodyBufferToString(
      Buffer.concat(this.requestBodyBuffer)
    )
    this.log('written request body:', writtenRequestBody)

    const finalRequestBody = bodyBufferToString(
      Buffer.concat(
        chunk
          ? concatChunkToBuffer(chunk, this.requestBodyBuffer)
          : this.requestBodyBuffer
      )
    )
    this.log('final request body:', finalRequestBody)

    return finalRequestBody
  }

  private toIsomorphicRequest(body: string): IsomorphicRequest {
    this.log('creating isomorphic request object...')

    const outgoingHeaders = this.getHeaders()
    this.log('request outgoing headers:', outgoingHeaders)

    const headers = new Headers()
    for (const [headerName, headerValue] of Object.entries(outgoingHeaders)) {
      if (!headerValue) {
        continue
      }

      headers.set(headerName.toLowerCase(), headerValue.toString())
    }

    const isomorphicRequest: IsomorphicRequest = {
      id: uuidv4(),
      url: this.url,
      method: this.options.method || 'GET',
      credentials: 'omit',
      headers,
      body,
    }

    this.log('successfully created isomorphic request!', isomorphicRequest)
    return isomorphicRequest
  }
}
