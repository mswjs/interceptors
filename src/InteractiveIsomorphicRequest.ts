import { invariant } from 'outvariant'
import { Response } from '@remix-run/web-fetch'
import { IsomorphicRequest } from './IsomorphicRequest'
import { createLazyCallback, LazyCallback } from './utils/createLazyCallback'

export class InteractiveIsomorphicRequest extends IsomorphicRequest {
  public respondWith: LazyCallback<(response: Response) => void>

  constructor(request: IsomorphicRequest) {
    super(request)

    this.respondWith = createLazyCallback({
      maxCalls: 1,
      maxCallsCallback: () => {
        invariant(
          false,
          'Failed to respond to "%s %s" request: the "request" event has already been responded to.',
          this.method,
          this.url.href
        )
      },
    })
  }
}
