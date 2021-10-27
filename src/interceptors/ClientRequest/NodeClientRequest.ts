import { Debugger, debug } from 'debug'
import {
  get,
  request,
  Agent as HttpAgent,
  RequestOptions,
  ClientRequest,
  ClientRequestArgs,
  IncomingMessage,
} from 'http'
import { Agent as HttpsAgent } from 'https'
import { until } from '@open-draft/until'
import { Headers, objectToHeaders } from 'headers-utils/lib'
import {
  IsomorphicRequest,
  MockedResponse,
  Observer,
  Resolver,
} from '../../createInterceptor'
import { uuidv4 } from '../../utils/uuid'
import { concatChunkToBuffer } from './utils/concatChunkToBuffer'
import {
  HttpRequestEndChunk,
  normalizeHttpRequestEndParams,
} from './utils/normalizeHttpRequestEndParams'
import { normalizeHttpRequestParams } from './utils/normalizeHttpRequestParams'
import { toIsoResponse } from '../../utils/toIsoResponse'
import { getIncomingMessageBody } from './utils/getIncomingMessageBody'
import { bodyBufferToString } from './utils/bodyBufferToString'
import { HttpRequestCallback } from './ClientRequest.glossary'
import { getRequestOptionsByUrl } from '../../utils/getRequestOptionsByUrl'

export type Protocol = 'http' | 'https'
export type OriginalMethod = typeof get | typeof request

export interface NodeClientRequestOptions {
  defaultProtocol: Protocol
  originalMethod: OriginalMethod
  observer: Observer
  resolver: Resolver
  requestOptions: Parameters<typeof request>
}

function transformInput(
  input: NodeClientRequestOptions
): [url: ClientRequestArgs, callback?: HttpRequestCallback] {
  const log = debug('http transformInput')
  log('transforming ClientRequest constructor arguments:', input)

  const [url, requestOptions, callback] = normalizeHttpRequestParams(
    input.defaultProtocol + ':',
    ...input.requestOptions
  )
  const requestOptionsFromUrl = getRequestOptionsByUrl(url)
  log('derived RequestOptions from URL:', requestOptionsFromUrl)

  const clientRequestOptions = {
    ...requestOptionsFromUrl,
    ...requestOptions,
  }

  // Resolve the proper "Agent" depending on the URL protocol.
  if (!clientRequestOptions.agent) {
    log('has no agent, resolving...')

    const agent =
      url.protocol === 'https:'
        ? new HttpsAgent({
            rejectUnauthorized: requestOptions.rejectUnauthorized,
          })
        : new HttpAgent()
    log('resolved agent:', agent)

    clientRequestOptions.agent = agent
  }

  /**
   * @note "ClientRequest" accepts either URL string or "RequestOptions".
   * Reduce both to "RequestOptions", merging any explicit options
   * with the ones derived from the URL.
   */
  const constructorArgs: [
    url: ClientRequestArgs,
    callback?: HttpRequestCallback
  ] = [clientRequestOptions, callback]

  log('resolved ClientRequest constructor arguments:', constructorArgs)

  return constructorArgs
}

export class NodeClientRequest extends ClientRequest {
  private url: URL
  private options: RequestOptions
  private requestBodyBuffer: Buffer[] = []
  private response: IncomingMessage
  private resolver: Resolver
  private observer: Observer
  private log: Debugger

  constructor(input: NodeClientRequestOptions) {
    super(...transformInput(input))

    const [url, options, callback] = normalizeHttpRequestParams(
      input.defaultProtocol + ':',
      ...input.requestOptions
    )

    this.log = debug(`http ${options.method} ${url.href}`)
    this.log('constructing ClientRequest...', { url, options, callback })

    this.url = url
    this.options = options
    this.resolver = input.resolver
    this.observer = input.observer

    // Response.
    this.response = new IncomingMessage(this.socket!)
  }

  private normalizeWriteParams(
    ...args: any[]
  ): [
    chunk: string | Buffer,
    encoding?: BufferEncoding,
    callback?: (error: Error | null | undefined) => void
  ] {
    const chunk = args[0]
    const encoding =
      typeof args[1] === 'string' ? (args[1] as BufferEncoding) : undefined
    const callback = typeof args[1] === 'function' ? args[1] : args[2]
    return [chunk, encoding, callback]
  }

  write(...args: any[]): boolean {
    const [chunk, encoding, callback] = this.normalizeWriteParams(...args)
    this.log('writing chunk:', { chunk, encoding, callback })

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

    const [chunk, encoding, callback] = normalizeHttpRequestEndParams(...args)
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
      this.log('original response error:', error)
    })

    this.once('abort', () => {
      this.log('original request aborted!')
    })

    // Perform the request as-is.
    this.once('response', async (response) => {
      const responseBody = await getIncomingMessageBody(response)
      this.log(response.statusCode, response.statusMessage, responseBody)
      this.log('original resopnse headers:', response.headers)

      this.observer.emit('response', isomorphicRequest, {
        status: response.statusCode || 200,
        statusText: response.statusMessage || 'OK',
        headers: objectToHeaders(response.headers),
        body: responseBody,
      })
    })

    this.log('performing original request...')
    super.end(chunk, encoding || 'utf8', () => {
      this.log('original request end!')
      callback?.()
    })
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

    // @ts-ignore
    this.res = this.response

    // @ts-ignore
    this.agent.destroy()

    this.emit('finish')
    this.emit('response', this.response)
  }

  private getRequestBody(chunk: HttpRequestEndChunk | null): string {
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
      headers,
      body,
    }

    this.log('successfully created isomorphic request!', isomorphicRequest)
    return isomorphicRequest
  }
}
