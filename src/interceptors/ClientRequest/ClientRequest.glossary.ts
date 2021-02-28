import { IncomingMessage } from 'http'

// Request instance constructed by the `request` library
// has a `self` property that has a `uri` field. This is
// reproducible by performing a `XMLHttpRequest` request (jsdom).
export interface RequestSelf {
  uri?: URL
}

export type HttpRequestCallback = (response: IncomingMessage) => void
